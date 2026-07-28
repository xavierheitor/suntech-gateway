import net, { type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { normalizeFrame, parseFrame, terminatorFromEnv } from './protocol';
import { GatewayStore } from './store';

export class SuntechTcpServer {
  private readonly server: net.Server;
  private readonly idleFlushMs = Number(process.env.SOCKET_IDLE_FLUSH_MS || 300);
  private readonly commandTerminator = terminatorFromEnv(process.env.COMMAND_TERMINATOR);

  constructor(
    private readonly store: GatewayStore,
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

  send(connectionId: string, rawCommand: string): Promise<void> {
    const connection = this.store.getConnection(connectionId);
    if (!connection) return Promise.reject(new Error('Conexão não encontrada.'));
    if (connection.socket.destroyed || !connection.socket.writable) {
      return Promise.reject(new Error('Socket não está disponível para escrita.'));
    }

    const payload = normalizeFrame(rawCommand) + this.commandTerminator;
    return new Promise((resolve, reject) => {
      connection.socket.write(payload, 'ascii', (error) => {
        if (error) return reject(error);
        this.store.addMessage('OUT', connectionId, normalizeFrame(rawCommand));
        console.log(`[TCP][OUT][${connection.deviceId || connectionId}] ${normalizeFrame(rawCommand)}`);
        resolve();
      });
    });
  }

  private handleConnection(socket: Socket): void {
    socket.setKeepAlive(true, 30_000);
    socket.setNoDelay(true);

    const connectionId = randomUUID();
    const now = new Date().toISOString();
    const remoteAddress = socket.remoteAddress || 'unknown';
    const remotePort = socket.remotePort || 0;

    this.store.addConnection({
      connectionId,
      remoteAddress,
      remotePort,
      connectedAt: now,
      lastSeenAt: now,
      socket,
      buffer: '',
    });

    console.log(`[TCP] Conectado ${connectionId} (${remoteAddress}:${remotePort})`);

    socket.on('data', (chunk) => {
      const connection = this.store.getConnection(connectionId);
      if (!connection) return;

      connection.buffer += chunk.toString('ascii');
      this.store.touch(connectionId);
      this.consumeDelimitedFrames(connectionId);
      this.scheduleIdleFlush(connectionId);
    });

    socket.on('error', (error) => {
      console.error(`[TCP] Erro ${connectionId}:`, error.message);
    });

    socket.on('close', () => {
      this.flushBuffer(connectionId);
      this.store.removeConnection(connectionId);
      console.log(`[TCP] Desconectado ${connectionId}`);
    });
  }

  private consumeDelimitedFrames(connectionId: string): void {
    const connection = this.store.getConnection(connectionId);
    if (!connection) return;

    // Aceita CRLF, LF ou CR. TCP pode juntar vários pacotes no mesmo chunk.
    const parts = connection.buffer.split(/\r\n|\n|\r/);
    connection.buffer = parts.pop() || '';
    for (const part of parts) this.processFrame(connectionId, part);
  }

  private scheduleIdleFlush(connectionId: string): void {
    const connection = this.store.getConnection(connectionId);
    if (!connection) return;
    if (connection.idleTimer) clearTimeout(connection.idleTimer);
    connection.idleTimer = setTimeout(() => this.flushBuffer(connectionId), this.idleFlushMs);
  }

  private flushBuffer(connectionId: string): void {
    const connection = this.store.getConnection(connectionId);
    if (!connection || !connection.buffer.trim()) return;
    const frame = connection.buffer;
    connection.buffer = '';
    this.processFrame(connectionId, frame);
  }

  private processFrame(connectionId: string, raw: string): void {
    const frame = normalizeFrame(raw);
    if (!frame) return;
    const parsed = parseFrame(frame);
    this.store.identify(connectionId, parsed.deviceId);
    this.store.addMessage('IN', connectionId, frame);
    console.log(`[TCP][IN][${parsed.deviceId || connectionId}][${parsed.kind}] ${frame}`);
  }
}
