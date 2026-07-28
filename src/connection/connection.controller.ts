import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { buildCommand } from '../protocol';
import type { ConnectionService } from './connection.service';
import type { ConnectionManager } from './connection.manager';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export class ConnectionController {
  readonly router: Router;

  constructor(
    private readonly service: ConnectionService,
    private readonly manager: ConnectionManager,
  ) {
    this.router = createRouter();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get('/connections', (_req, res) => this.list(_req, res));
    this.router.get('/connections/:id', (req, res) => this.get(req, res));
    this.router.get('/connections/:id/history', (req, res) => this.history(req, res));
    this.router.post('/connections/:id/send', (req, res) => void this.send(req, res));
    this.router.post('/connections/:id/disconnect', (req, res) => this.disconnect(req, res));

    // Legado — mantém comportamento existente
    this.router.get('/messages', (req, res) => this.listMessages(req, res));
    this.router.post('/devices/:deviceId/commands', (req, res) => void this.sendByDevice(req, res));
    this.router.post('/connections/:connectionId/commands', (req, res) => void this.sendLegacyCommand(req, res));
  }

  private list(_req: Request, res: Response): void {
    const limit = _req.query.limit ? Number(_req.query.limit) : undefined;
    res.json(this.service.list(limit));
  }

  private get(req: Request, res: Response): void {
    const connection = this.service.get(param(req.params.id));
    if (!connection) {
      res.status(404).json({ error: 'Conexão não encontrada.' });
      return;
    }
    res.json(connection);
  }

  private history(req: Request, res: Response): void {
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    const history = this.service.history(param(req.params.id), limit);
    if (!history) {
      res.status(404).json({ error: 'Conexão não encontrada.' });
      return;
    }
    res.json(history);
  }

  private async send(req: Request, res: Response): Promise<void> {
    try {
      const id = param(req.params.id);
      const text = req.body?.text;
      if (typeof text !== 'string') {
        res.status(400).json({ error: 'Campo "text" é obrigatório.' });
        return;
      }

      const appendTerminator = Boolean(req.body?.appendTerminator);
      const message = await this.service.sendRaw(id, text, appendTerminator);
      res.status(202).json({
        accepted: true,
        connectionId: id,
        message,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao enviar.';
      const status = msg.includes('não encontrada') ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  }

  private disconnect(req: Request, res: Response): void {
    const id = param(req.params.id);
    const ok = this.service.disconnect(id);
    if (!ok) {
      res.status(404).json({ error: 'Conexão ativa não encontrada.' });
      return;
    }
    res.json({ disconnected: true, connectionId: id });
  }

  private listMessages(req: Request, res: Response): void {
    res.json(this.manager.listMessages({
      deviceId: req.query.deviceId as string | undefined,
      direction: req.query.direction as string | undefined,
      kind: req.query.kind as string | undefined,
      connectionId: req.query.connectionId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }));
  }

  private async sendByDevice(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = param(req.params.deviceId);
      const connection = this.manager.findByDeviceId(deviceId);
      if (!connection) {
        res.status(404).json({ error: 'Dispositivo não está conectado.' });
        return;
      }

      const input = String(req.body?.command || '');
      const command = buildCommand(deviceId, input);
      await this.service.sendCommand(connection.connectionId, command);
      res.status(202).json({
        accepted: true,
        deviceId,
        connectionId: connection.connectionId,
        command,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
    }
  }

  private async sendLegacyCommand(req: Request, res: Response): Promise<void> {
    try {
      const connectionId = param(req.params.connectionId);
      const connection = this.manager.getLive(connectionId);
      if (!connection) {
        res.status(404).json({ error: 'Conexão não encontrada.' });
        return;
      }

      const input = String(req.body?.command || '');
      const command = connection.esn ? buildCommand(connection.esn, input) : input.trim();
      if (!command) {
        res.status(400).json({ error: 'Comando vazio.' });
        return;
      }

      await this.service.sendCommand(connection.connectionId, command);
      res.status(202).json({
        accepted: true,
        connectionId: connection.connectionId,
        command,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
    }
  }
}
