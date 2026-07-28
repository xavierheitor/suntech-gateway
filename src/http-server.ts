import express from 'express';
import cors from 'cors';
import { buildCommand } from './protocol';
import { GatewayStore } from './store';
import { SuntechTcpServer } from './tcp-server';

export function createHttpApp(store: GatewayStore, tcp: SuntechTcpServer) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/connections', (_req, res) => {
    res.json(store.listConnections());
  });

  app.get('/messages', (req, res) => {
    res.json(store.listMessages({
      deviceId: req.query.deviceId as string | undefined,
      direction: req.query.direction as string | undefined,
      kind: req.query.kind as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }));
  });

  app.post('/devices/:deviceId/commands', async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      const connection = store.findByDeviceId(deviceId);
      if (!connection) return res.status(404).json({ error: 'Dispositivo não está conectado.' });

      const input = String(req.body?.command || '');
      const command = buildCommand(deviceId, input);
      await tcp.send(connection.connectionId, command);
      return res.status(202).json({ accepted: true, deviceId, connectionId: connection.connectionId, command });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
    }
  });

  app.post('/connections/:connectionId/commands', async (req, res) => {
    try {
      const connection = store.getConnection(req.params.connectionId);
      if (!connection) return res.status(404).json({ error: 'Conexão não encontrada.' });

      const input = String(req.body?.command || '');
      const command = connection.deviceId ? buildCommand(connection.deviceId, input) : input.trim();
      if (!command) return res.status(400).json({ error: 'Comando vazio.' });

      await tcp.send(connection.connectionId, command);
      return res.status(202).json({ accepted: true, connectionId: connection.connectionId, command });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
    }
  });

  return app;
}
