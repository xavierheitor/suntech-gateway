import type { DatabaseSync } from 'node:sqlite';
import type { ConnectionStatus, TcpConnectionRecord } from '../types';

export class ConnectionRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(record: TcpConnectionRecord): void {
    this.db.prepare(`
      INSERT INTO TcpConnection (id, esn, remoteIp, remotePort, connectedAt, disconnectedAt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.esn,
      record.remoteIp,
      record.remotePort,
      record.connectedAt,
      record.disconnectedAt,
      record.status,
    );
  }

  updateEsn(id: string, esn: string): void {
    this.db.prepare('UPDATE TcpConnection SET esn = ? WHERE id = ?').run(esn, id);
  }

  markDisconnected(id: string, disconnectedAt: string): void {
    this.db.prepare(`
      UPDATE TcpConnection
      SET status = 'DISCONNECTED', disconnectedAt = ?
      WHERE id = ?
    `).run(disconnectedAt, id);
  }

  findById(id: string): TcpConnectionRecord | undefined {
    return this.db.prepare(`
      SELECT id, esn, remoteIp, remotePort, connectedAt, disconnectedAt, status
      FROM TcpConnection WHERE id = ?
    `).get(id) as unknown as TcpConnectionRecord | undefined;
  }

  list(options: { status?: ConnectionStatus; limit?: number } = {}): TcpConnectionRecord[] {
    const limit = Math.min(Math.max(options.limit || 200, 1), 1000);
    if (options.status) {
      return this.db.prepare(`
        SELECT id, esn, remoteIp, remotePort, connectedAt, disconnectedAt, status
        FROM TcpConnection
        WHERE status = ?
        ORDER BY connectedAt DESC
        LIMIT ?
      `).all(options.status, limit) as unknown as TcpConnectionRecord[];
    }

    return this.db.prepare(`
      SELECT id, esn, remoteIp, remotePort, connectedAt, disconnectedAt, status
      FROM TcpConnection
      ORDER BY
        CASE status WHEN 'CONNECTED' THEN 0 ELSE 1 END,
        connectedAt DESC
      LIMIT ?
    `).all(limit) as unknown as TcpConnectionRecord[];
  }

  /** Marca conexões órfãs CONNECTED como DISCONNECTED (após restart). */
  markAllDisconnected(disconnectedAt: string): number {
    const result = this.db.prepare(`
      UPDATE TcpConnection
      SET status = 'DISCONNECTED', disconnectedAt = COALESCE(disconnectedAt, ?)
      WHERE status = 'CONNECTED'
    `).run(disconnectedAt);
    return Number(result.changes || 0);
  }
}
