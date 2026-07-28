"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpApp = createHttpApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const protocol_1 = require("./protocol");
function createHttpApp(store, tcp) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: '64kb' }));
    app.get('/health', (_req, res) => {
        res.json({ ok: true, timestamp: new Date().toISOString() });
    });
    app.get('/connections', (_req, res) => {
        res.json(store.listConnections());
    });
    app.get('/messages', (req, res) => {
        res.json(store.listMessages({
            deviceId: req.query.deviceId,
            direction: req.query.direction,
            kind: req.query.kind,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
        }));
    });
    app.post('/devices/:deviceId/commands', async (req, res) => {
        try {
            const deviceId = req.params.deviceId;
            const connection = store.findByDeviceId(deviceId);
            if (!connection)
                return res.status(404).json({ error: 'Dispositivo não está conectado.' });
            const input = String(req.body?.command || '');
            const command = (0, protocol_1.buildCommand)(deviceId, input);
            await tcp.send(connection.connectionId, command);
            return res.status(202).json({ accepted: true, deviceId, connectionId: connection.connectionId, command });
        }
        catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
        }
    });
    app.post('/connections/:connectionId/commands', async (req, res) => {
        try {
            const connection = store.getConnection(req.params.connectionId);
            if (!connection)
                return res.status(404).json({ error: 'Conexão não encontrada.' });
            const input = String(req.body?.command || '');
            const command = connection.deviceId ? (0, protocol_1.buildCommand)(connection.deviceId, input) : input.trim();
            if (!command)
                return res.status(400).json({ error: 'Comando vazio.' });
            await tcp.send(connection.connectionId, command);
            return res.status(202).json({ accepted: true, connectionId: connection.connectionId, command });
        }
        catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'Erro ao enviar comando.' });
        }
    });
    return app;
}
