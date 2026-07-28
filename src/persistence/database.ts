import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDatabase(dbPath = process.env.DATABASE_PATH || './data/gateway.db'): DatabaseSync {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS TcpConnection (
      id TEXT PRIMARY KEY,
      esn TEXT,
      remoteIp TEXT NOT NULL,
      remotePort INTEGER NOT NULL,
      connectedAt TEXT NOT NULL,
      disconnectedAt TEXT,
      status TEXT NOT NULL CHECK (status IN ('CONNECTED', 'DISCONNECTED'))
    );

    CREATE INDEX IF NOT EXISTS idx_tcp_connection_status ON TcpConnection(status);
    CREATE INDEX IF NOT EXISTS idx_tcp_connection_esn ON TcpConnection(esn);

    CREATE TABLE IF NOT EXISTS TcpMessage (
      id TEXT PRIMARY KEY,
      connectionId TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
      protocol TEXT NOT NULL,
      rawMessage TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (connectionId) REFERENCES TcpConnection(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tcp_message_connection ON TcpMessage(connectionId, timestamp);
    CREATE INDEX IF NOT EXISTS idx_tcp_message_timestamp ON TcpMessage(timestamp);
  `);

  return db;
}
