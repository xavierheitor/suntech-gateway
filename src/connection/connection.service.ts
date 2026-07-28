import type { ConnectionManager } from './connection.manager';
import type { ConnectionView, TcpMessageRecord } from '../types';

export class ConnectionService {
  constructor(private readonly manager: ConnectionManager) {}

  list(limit?: number): ConnectionView[] {
    return this.manager.listConnections(limit);
  }

  get(id: string): ConnectionView | undefined {
    return this.manager.getConnectionView(id);
  }

  history(id: string, limit?: number): TcpMessageRecord[] | undefined {
    if (!this.manager.getConnectionView(id)) return undefined;
    return this.manager.getHistory(id, limit);
  }

  async sendRaw(id: string, text: string, appendTerminator = false): Promise<TcpMessageRecord> {
    return this.manager.send(id, text, {
      appendTerminator,
      normalize: false,
    });
  }

  async sendCommand(id: string, command: string): Promise<TcpMessageRecord> {
    return this.manager.send(id, command, {
      appendTerminator: true,
      normalize: true,
    });
  }

  disconnect(id: string): boolean {
    return this.manager.disconnect(id);
  }
}
