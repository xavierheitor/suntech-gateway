import type { Socket } from 'node:net';

export interface DeviceConnection {
  connectionId: string;
  deviceId?: string;
  remoteAddress: string;
  remotePort: number;
  connectedAt: string;
  lastSeenAt: string;
  socket: Socket;
  buffer: string;
  idleTimer?: NodeJS.Timeout;
}

export interface GatewayMessage {
  id: string;
  direction: 'IN' | 'OUT';
  connectionId: string;
  deviceId?: string;
  timestamp: string;
  raw: string;
  kind: string;
  fields: string[];
}
