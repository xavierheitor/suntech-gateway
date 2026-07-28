import { randomUUID } from 'node:crypto';
import type { Socket } from 'node:net';
import { normalizeFrame, parseFrame, terminatorFromEnv } from '../protocol';
import type { EventBus } from '../common/event-bus';
import type { ConnectionRepository } from '../persistence/connection.repository';
import type { MessageRepository } from '../persistence/message.repository';
import type {
  ConnectionView,
  LiveConnection,
  MessageDirection,
  SendOptions,
  TcpMessageRecord,
} from '../types';

export class ConnectionManager {
  private readonly live = new Map<string, LiveConnection>();
  private readonly commandTerminator = terminatorFromEnv(process.env.COMMAND_TERMINATOR);

  constructor(
    private readonly connections: ConnectionRepository,
    private readonly messages: MessageRepository,
    private readonly events: EventBus,
  ) {}

  /** Registra socket vivo + persiste TcpConnection. */
  open(socket: Socket): LiveConnection {
    const connectionId = randomUUID();
    const now = new Date().toISOString();
    const remoteIp = socket.remoteAddress || 'unknown';
    const remotePort = socket.remotePort || 0;

    const live: LiveConnection = {
      connectionId,
      remoteIp,
      remotePort,
      connectedAt: now,
      lastSeenAt: now,
      status: 'CONNECTED',
      socket,
      buffer: '',
    };

    this.live.set(connectionId, live);
    this.connections.insert({
      id: connectionId,
      esn: null,
      remoteIp,
      remotePort,
      connectedAt: now,
      disconnectedAt: null,
      status: 'CONNECTED',
    });

    this.events.emit('connection.created', { connection: this.toView(live) });
    return live;
  }

  close(connectionId: string): void {
    const live = this.live.get(connectionId);
    if (!live) return;

    if (live.idleTimer) clearTimeout(live.idleTimer);
    this.live.delete(connectionId);

    const disconnectedAt = new Date().toISOString();
    this.connections.markDisconnected(connectionId, disconnectedAt);

    const view = this.toView({
      ...live,
      status: 'CONNECTED',
    }, { forceStatus: 'DISCONNECTED', disconnectedAt });

    this.events.emit('connection.closed', { connection: view });
  }

  getLive(connectionId: string): LiveConnection | undefined {
    return this.live.get(connectionId);
  }

  /** Compat: retorna conexão viva no formato antigo. */
  getConnection(connectionId: string): (LiveConnection & { deviceId?: string; remoteAddress: string }) | undefined {
    const live = this.live.get(connectionId);
    if (!live) return undefined;
    return {
      ...live,
      deviceId: live.esn,
      remoteAddress: live.remoteIp,
    };
  }

  findByEsn(esn: string): LiveConnection | undefined {
    return [...this.live.values()].find((item) => item.esn === esn);
  }

  findByDeviceId(deviceId: string): LiveConnection | undefined {
    return this.findByEsn(deviceId);
  }

  identify(connectionId: string, esn?: string): void {
    if (!esn) return;
    const live = this.live.get(connectionId);
    if (!live || live.esn === esn) return;

    live.esn = esn;
    this.connections.updateEsn(connectionId, esn);
    this.events.emit('connection.updated', { connection: this.toView(live) });
  }

  touch(connectionId: string): void {
    const live = this.live.get(connectionId);
    if (live) live.lastSeenAt = new Date().toISOString();
  }

  /**
   * Envia bytes pela conexão TCP já aberta pelo rastreador.
   * Por padrão NÃO altera o texto; terminator/normalize são opt-in.
   */
  async send(connectionId: string, text: string, options: SendOptions = {}): Promise<TcpMessageRecord> {
    const live = this.live.get(connectionId);
    if (!live) throw new Error('Conexão não encontrada.');
    if (live.socket.destroyed || !live.socket.writable) {
      throw new Error('Socket não está disponível para escrita.');
    }

    const appendTerminator = options.appendTerminator ?? false;
    const shouldNormalize = options.normalize ?? false;
    const body = shouldNormalize ? normalizeFrame(text) : text;
    if (body.length === 0 && !appendTerminator) {
      throw new Error('Payload vazio.');
    }

    const payload = appendTerminator ? body + this.commandTerminator : body;
    const auditRaw = shouldNormalize ? body : text;

    await new Promise<void>((resolve, reject) => {
      live.socket.write(payload, 'ascii', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const message = this.recordMessage('OUT', connectionId, auditRaw || body);
    this.events.emit('message.sent', {
      message,
      connection: this.toView(live),
    });

    console.log(`[TCP][OUT][${live.esn || connectionId}] ${auditRaw || body}`);
    return message;
  }

  /** Encaminha frame recebido: identifica ESN, persiste e publica evento. */
  ingestIncoming(connectionId: string, raw: string): TcpMessageRecord | undefined {
    const frame = normalizeFrame(raw);
    if (!frame) return undefined;

    const parsed = parseFrame(frame);
    this.identify(connectionId, parsed.deviceId);
    const message = this.recordMessage('IN', connectionId, frame);
    const live = this.live.get(connectionId);
    if (live) {
      this.events.emit('message.received', {
        message,
        connection: this.toView(live),
      });
    }
    console.log(`[TCP][IN][${parsed.deviceId || connectionId}][${parsed.kind}] ${frame}`);
    return message;
  }

  listLiveViews(): ConnectionView[] {
    return [...this.live.values()].map((live) => this.toView(live));
  }

  /** Lista persistida (ativas + recentes), enriquecida com dados ao vivo. */
  listConnections(limit = 200): ConnectionView[] {
    const records = this.connections.list({ limit });
    return records.map((record) => {
      const live = this.live.get(record.id);
      if (live) return this.toView(live);
      const latest = this.messages.latestByConnection(record.id);
      return {
        id: record.id,
        esn: record.esn,
        remoteIp: record.remoteIp,
        remotePort: record.remotePort,
        connectedAt: record.connectedAt,
        disconnectedAt: record.disconnectedAt,
        status: record.status,
        lastMessage: latest?.rawMessage ?? null,
        lastMessageAt: latest?.timestamp ?? null,
        connectedForMs: elapsedMs(record.connectedAt, record.disconnectedAt || record.connectedAt),
      };
    });
  }

  getConnectionView(id: string): ConnectionView | undefined {
    const live = this.live.get(id);
    if (live) return this.toView(live);

    const record = this.connections.findById(id);
    if (!record) return undefined;
    const latest = this.messages.latestByConnection(id);
    return {
      id: record.id,
      esn: record.esn,
      remoteIp: record.remoteIp,
      remotePort: record.remotePort,
      connectedAt: record.connectedAt,
      disconnectedAt: record.disconnectedAt,
      status: record.status,
      lastMessage: latest?.rawMessage ?? null,
      lastMessageAt: latest?.timestamp ?? null,
      connectedForMs: elapsedMs(record.connectedAt, record.disconnectedAt || new Date().toISOString()),
    };
  }

  getHistory(connectionId: string, limit = 500): TcpMessageRecord[] {
    return this.messages.listByConnection(connectionId, limit);
  }

  disconnect(connectionId: string): boolean {
    const live = this.live.get(connectionId);
    if (!live) return false;
    live.socket.destroy();
    return true;
  }

  /** Compatibilidade com GET /messages legado. */
  listMessages(filters: {
    deviceId?: string;
    direction?: string;
    kind?: string;
    connectionId?: string;
    limit?: number;
  }) {
    return this.messages.list(filters).map((m) => ({
      id: m.id,
      direction: m.direction,
      connectionId: m.connectionId,
      deviceId: m.esn || undefined,
      timestamp: m.timestamp,
      raw: m.rawMessage,
      kind: m.protocol,
      fields: m.rawMessage.split(';'),
    }));
  }

  private recordMessage(direction: MessageDirection, connectionId: string, raw: string): TcpMessageRecord {
    const parsed = parseFrame(raw);
    const live = this.live.get(connectionId);
    const message: TcpMessageRecord = {
      id: randomUUID(),
      connectionId,
      direction,
      protocol: parsed.kind,
      rawMessage: raw,
      timestamp: new Date().toISOString(),
      esn: parsed.deviceId || live?.esn || null,
    };
    this.messages.insert(message);
    if (live) live.lastSeenAt = message.timestamp;
    return message;
  }

  private toView(
    live: LiveConnection,
    overrides?: { forceStatus?: 'CONNECTED' | 'DISCONNECTED'; disconnectedAt?: string },
  ): ConnectionView {
    const latest = this.messages.latestByConnection(live.connectionId);
    const status = overrides?.forceStatus || 'CONNECTED';
    const end = overrides?.disconnectedAt || new Date().toISOString();
    return {
      id: live.connectionId,
      esn: live.esn || null,
      remoteIp: live.remoteIp,
      remotePort: live.remotePort,
      connectedAt: live.connectedAt,
      disconnectedAt: overrides?.disconnectedAt || null,
      status,
      lastSeenAt: live.lastSeenAt,
      lastMessage: latest?.rawMessage ?? null,
      lastMessageAt: latest?.timestamp ?? null,
      connectedForMs: elapsedMs(live.connectedAt, status === 'CONNECTED' ? undefined : end),
    };
  }
}

function elapsedMs(fromIso: string, toIso?: string): number {
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : Date.now();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, to - from);
}
