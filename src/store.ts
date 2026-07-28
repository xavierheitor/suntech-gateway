import { randomUUID } from 'node:crypto';
import type { DeviceConnection, GatewayMessage } from './types';
import { parseFrame } from './protocol';

export class GatewayStore {
  private readonly connections = new Map<string, DeviceConnection>();
  private readonly messages: GatewayMessage[] = [];

  constructor(private readonly maxMessages: number) {}

  addConnection(connection: DeviceConnection): void {
    this.connections.set(connection.connectionId, connection);
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection?.idleTimer) clearTimeout(connection.idleTimer);
    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): DeviceConnection | undefined {
    return this.connections.get(connectionId);
  }

  findByDeviceId(deviceId: string): DeviceConnection | undefined {
    return [...this.connections.values()].find((item) => item.deviceId === deviceId);
  }

  identify(connectionId: string, deviceId?: string): void {
    if (!deviceId) return;
    const connection = this.connections.get(connectionId);
    if (connection) connection.deviceId = deviceId;
  }

  touch(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) connection.lastSeenAt = new Date().toISOString();
  }

  listConnections() {
    return [...this.connections.values()].map(({ socket: _socket, buffer: _buffer, idleTimer: _timer, ...safe }) => safe);
  }

  addMessage(direction: 'IN' | 'OUT', connectionId: string, raw: string): GatewayMessage {
    const parsed = parseFrame(raw);
    const connection = this.connections.get(connectionId);
    const message: GatewayMessage = {
      id: randomUUID(),
      direction,
      connectionId,
      deviceId: parsed.deviceId || connection?.deviceId,
      timestamp: new Date().toISOString(),
      raw,
      kind: parsed.kind,
      fields: parsed.fields,
    };

    this.messages.unshift(message);
    if (this.messages.length > this.maxMessages) this.messages.length = this.maxMessages;
    return message;
  }

  listMessages(filters: { deviceId?: string; direction?: string; kind?: string; limit?: number }) {
    const limit = Math.min(Math.max(filters.limit || 100, 1), 1000);
    return this.messages
      .filter((m) => !filters.deviceId || m.deviceId === filters.deviceId)
      .filter((m) => !filters.direction || m.direction === filters.direction.toUpperCase())
      .filter((m) => !filters.kind || m.kind === filters.kind.toUpperCase())
      .slice(0, limit);
  }
}
