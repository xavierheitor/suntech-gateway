import path from 'node:path';
import express from 'express';
import cors from 'cors';
import type { ConnectionController } from '../connection/connection.controller';

export function createHttpApp(controller: ConnectionController) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use(controller.router);

  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/console', (_req, res) => {
    res.sendFile(path.join(publicDir, 'console.html'));
  });

  app.get('/device', (_req, res) => {
    res.sendFile(path.join(publicDir, 'device.html'));
  });

  return app;
}
