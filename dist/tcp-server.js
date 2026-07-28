"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuntechTcpServer = void 0;
const node_net_1 = __importDefault(require("node:net"));
const node_crypto_1 = require("node:crypto");
const protocol_1 = require("./protocol");
class SuntechTcpServer {
    store;
    host;
    port;
    server;
    idleFlushMs = Number(process.env.SOCKET_IDLE_FLUSH_MS || 300);
    commandTerminator = (0, protocol_1.terminatorFromEnv)(process.env.COMMAND_TERMINATOR);
    constructor(store, host, port) {
        this.store = store;
        this.host = host;
        this.port = port;
        this.server = node_net_1.default.createServer((socket) => this.handleConnection(socket));
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, this.host, () => {
                this.server.off('error', reject);
                console.log(`[TCP] Escutando em ${this.host}:${this.port}`);
                resolve();
            });
        });
    }
    send(connectionId, rawCommand) {
        const connection = this.store.getConnection(connectionId);
        if (!connection)
            return Promise.reject(new Error('Conexão não encontrada.'));
        if (connection.socket.destroyed || !connection.socket.writable) {
            return Promise.reject(new Error('Socket não está disponível para escrita.'));
        }
        const payload = (0, protocol_1.normalizeFrame)(rawCommand) + this.commandTerminator;
        return new Promise((resolve, reject) => {
            connection.socket.write(payload, 'ascii', (error) => {
                if (error)
                    return reject(error);
                this.store.addMessage('OUT', connectionId, (0, protocol_1.normalizeFrame)(rawCommand));
                console.log(`[TCP][OUT][${connection.deviceId || connectionId}] ${(0, protocol_1.normalizeFrame)(rawCommand)}`);
                resolve();
            });
        });
    }
    handleConnection(socket) {
        socket.setKeepAlive(true, 30_000);
        socket.setNoDelay(true);
        const connectionId = (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const remoteAddress = socket.remoteAddress || 'unknown';
        const remotePort = socket.remotePort || 0;
        this.store.addConnection({
            connectionId,
            remoteAddress,
            remotePort,
            connectedAt: now,
            lastSeenAt: now,
            socket,
            buffer: '',
        });
        console.log(`[TCP] Conectado ${connectionId} (${remoteAddress}:${remotePort})`);
        socket.on('data', (chunk) => {
            const connection = this.store.getConnection(connectionId);
            if (!connection)
                return;
            connection.buffer += chunk.toString('ascii');
            this.store.touch(connectionId);
            this.consumeDelimitedFrames(connectionId);
            this.scheduleIdleFlush(connectionId);
        });
        socket.on('error', (error) => {
            console.error(`[TCP] Erro ${connectionId}:`, error.message);
        });
        socket.on('close', () => {
            this.flushBuffer(connectionId);
            this.store.removeConnection(connectionId);
            console.log(`[TCP] Desconectado ${connectionId}`);
        });
    }
    consumeDelimitedFrames(connectionId) {
        const connection = this.store.getConnection(connectionId);
        if (!connection)
            return;
        // Aceita CRLF, LF ou CR. TCP pode juntar vários pacotes no mesmo chunk.
        const parts = connection.buffer.split(/\r\n|\n|\r/);
        connection.buffer = parts.pop() || '';
        for (const part of parts)
            this.processFrame(connectionId, part);
    }
    scheduleIdleFlush(connectionId) {
        const connection = this.store.getConnection(connectionId);
        if (!connection)
            return;
        if (connection.idleTimer)
            clearTimeout(connection.idleTimer);
        connection.idleTimer = setTimeout(() => this.flushBuffer(connectionId), this.idleFlushMs);
    }
    flushBuffer(connectionId) {
        const connection = this.store.getConnection(connectionId);
        if (!connection || !connection.buffer.trim())
            return;
        const frame = connection.buffer;
        connection.buffer = '';
        this.processFrame(connectionId, frame);
    }
    processFrame(connectionId, raw) {
        const frame = (0, protocol_1.normalizeFrame)(raw);
        if (!frame)
            return;
        const parsed = (0, protocol_1.parseFrame)(frame);
        this.store.identify(connectionId, parsed.deviceId);
        this.store.addMessage('IN', connectionId, frame);
        console.log(`[TCP][IN][${parsed.deviceId || connectionId}][${parsed.kind}] ${frame}`);
    }
}
exports.SuntechTcpServer = SuntechTcpServer;
