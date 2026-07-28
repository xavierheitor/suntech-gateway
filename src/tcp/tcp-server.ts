import net, { type Socket } from 'node:net';
import type { ConnectionManager } from '../connection/connection.manager';

/**
 * Gateway TCP: apenas abre/fecha conexões, faz framing e encaminha ao ConnectionManager.
 * Não envia comandos diretamente — o envio fica centralizado no ConnectionManager.
 */
export class SuntechTcpServer {
  private readonly server: net.Server;
  private readonly idleFlushMs = Number(process.env.SOCKET_IDLE_FLUSH_MS || 300);

  constructor(
    private readonly manager: ConnectionManager,
    private readonly host: string,
    private readonly port: number,
  ) {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        console.log(`[TCP] Escutando em ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    socket.setKeepAlive(true, 30_000);
    socket.setNoDelay(true);

    const live = this.manager.open(socket);
    const connectionId = live.connectionId;
    console.log(`[TCP] Conectado ${connectionId} (${live.remoteIp}:${live.remotePort})`);

    socket.on('data', (chunk) => {
      const connection = this.manager.getLive(connectionId);
      if (!connection) return;

      connection.buffer += chunk.toString('ascii');
      this.manager.touch(connectionId);
      this.consumeDelimitedFrames(connectionId);
      this.scheduleIdleFlush(connectionId);
    });

    socket.on('error', (error) => {
      console.error(`[TCP] Erro ${connectionId}:`, error.message);
    });

    socket.on('close', () => {
      this.flushBuffer(connectionId);
      this.manager.close(connectionId);
      console.log(`[TCP] Desconectado ${connectionId}`);
    });
  }

  private consumeDelimitedFrames(connectionId: string): void {
    const connection = this.manager.getLive(connectionId);
    if (!connection) return;

    // Aceita CRLF, LF ou CR. TCP pode juntar vários pacotes no mesmo chunk.
    const parts = connection.buffer.split(/\r\n|\n|\r/);
    connection.buffer = parts.pop() || '';
    for (const part of parts) this.manager.ingestIncoming(connectionId, part);
  }

  private scheduleIdleFlush(connectionId: string): void {
    const connection = this.manager.getLive(connectionId);
    if (!connection) return;
    if (connection.idleTimer) clearTimeout(connection.idleTimer);
    connection.idleTimer = setTimeout(() => this.flushBuffer(connectionId), this.idleFlushMs);
  }

  private flushBuffer(connectionId: string): void {
    const connection = this.manager.getLive(connectionId);
    if (!connection || !connection.buffer.trim()) return;
    const frame = connection.buffer;
    connection.buffer = '';
    this.manager.ingestIncoming(connectionId, frame);
  }
}
