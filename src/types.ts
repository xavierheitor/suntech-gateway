import type { Socket } from 'node:net';

export type MessageDirection = 'IN' | 'OUT';
export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface LiveConnection {
  connectionId: string;
  esn?: string;
  remoteIp: string;
  remotePort: number;
  connectedAt: string;
  lastSeenAt: string;
  status: 'CONNECTED';
  socket: Socket;
  buffer: string;
  idleTimer?: NodeJS.Timeout;
}

/** @deprecated Prefer LiveConnection / ConnectionView — mantido para compatibilidade. */
export type DeviceConnection = LiveConnection & {
  deviceId?: string;
  remoteAddress: string;
};

export interface TcpConnectionRecord {
  id: string;
  esn: string | null;
  remoteIp: string;
  remotePort: number;
  connectedAt: string;
  disconnectedAt: string | null;
  status: ConnectionStatus;
}

export interface TcpMessageRecord {
  id: string;
  connectionId: string;
  direction: MessageDirection;
  protocol: string;
  rawMessage: string;
  timestamp: string;
  esn?: string | null;
}

export interface ConnectionView {
  id: string;
  esn: string | null;
  remoteIp: string;
  remotePort: number;
  connectedAt: string;
  disconnectedAt: string | null;
  status: ConnectionStatus;
  lastSeenAt?: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  connectedForMs?: number;
}

export interface GatewayMessage {
  id: string;
  direction: MessageDirection;
  connectionId: string;
  deviceId?: string;
  timestamp: string;
  raw: string;
  kind: string;
  fields: string[];
}

export type GatewayEventName =
  | 'connection.created'
  | 'connection.closed'
  | 'connection.updated'
  | 'message.received'
  | 'message.sent';

export interface ConnectionEventPayload {
  connection: ConnectionView;
}

export interface MessageEventPayload {
  message: TcpMessageRecord;
  connection: ConnectionView;
}

export type SendOptions = {
  /** Quando true, acrescenta o terminador configurado (COMMAND_TERMINATOR). Default: true para comandos legado; false para /send bruto. */
  appendTerminator?: boolean;
  /** Quando true, normaliza trim de CRLF nas bordas. Default: false para /send bruto. */
  normalize?: boolean;
};
