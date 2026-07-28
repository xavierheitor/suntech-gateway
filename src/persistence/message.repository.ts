import type { DatabaseSync } from 'node:sqlite';
import type { MessageDirection, TcpMessageRecord } from '../types';

export class MessageRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(record: TcpMessageRecord): void {
    this.db.prepare(`
      INSERT INTO TcpMessage (id, connectionId, direction, protocol, rawMessage, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.connectionId,
      record.direction,
      record.protocol,
      record.rawMessage,
      record.timestamp,
    );
  }

  listByConnection(connectionId: string, limit = 500): TcpMessageRecord[] {
    const safeLimit = Math.min(Math.max(limit, 1), 5000);
    return this.db.prepare(`
      SELECT m.id, m.connectionId, m.direction, m.protocol, m.rawMessage, m.timestamp, c.esn
      FROM TcpMessage m
      LEFT JOIN TcpConnection c ON c.id = m.connectionId
      WHERE m.connectionId = ?
      ORDER BY m.timestamp ASC
      LIMIT ?
    `).all(connectionId, safeLimit) as unknown as TcpMessageRecord[];
  }

  list(filters: {
    deviceId?: string;
    direction?: string;
    kind?: string;
    connectionId?: string;
    limit?: number;
  }): TcpMessageRecord[] {
    const limit = Math.min(Math.max(filters.limit || 100, 1), 1000);
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.connectionId) {
      clauses.push('m.connectionId = ?');
      params.push(filters.connectionId);
    }
    if (filters.deviceId) {
      clauses.push('c.esn = ?');
      params.push(filters.deviceId);
    }
    if (filters.direction) {
      clauses.push('m.direction = ?');
      params.push(filters.direction.toUpperCase());
    }
    if (filters.kind) {
      clauses.push('m.protocol = ?');
      params.push(filters.kind.toUpperCase());
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit);

    return this.db.prepare(`
      SELECT m.id, m.connectionId, m.direction, m.protocol, m.rawMessage, m.timestamp, c.esn
      FROM TcpMessage m
      LEFT JOIN TcpConnection c ON c.id = m.connectionId
      ${where}
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(...params) as unknown as TcpMessageRecord[];
  }

  latestByConnection(connectionId: string): TcpMessageRecord | undefined {
    return this.db.prepare(`
      SELECT m.id, m.connectionId, m.direction, m.protocol, m.rawMessage, m.timestamp, c.esn
      FROM TcpMessage m
      LEFT JOIN TcpConnection c ON c.id = m.connectionId
      WHERE m.connectionId = ?
      ORDER BY m.timestamp DESC
      LIMIT 1
    `).get(connectionId) as unknown as TcpMessageRecord | undefined;
  }
}
