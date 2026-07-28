"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayStore = void 0;
const node_crypto_1 = require("node:crypto");
const protocol_1 = require("./protocol");
class GatewayStore {
    maxMessages;
    connections = new Map();
    messages = [];
    constructor(maxMessages) {
        this.maxMessages = maxMessages;
    }
    addConnection(connection) {
        this.connections.set(connection.connectionId, connection);
    }
    removeConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection?.idleTimer)
            clearTimeout(connection.idleTimer);
        this.connections.delete(connectionId);
    }
    getConnection(connectionId) {
        return this.connections.get(connectionId);
    }
    findByDeviceId(deviceId) {
        return [...this.connections.values()].find((item) => item.deviceId === deviceId);
    }
    identify(connectionId, deviceId) {
        if (!deviceId)
            return;
        const connection = this.connections.get(connectionId);
        if (connection)
            connection.deviceId = deviceId;
    }
    touch(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection)
            connection.lastSeenAt = new Date().toISOString();
    }
    listConnections() {
        return [...this.connections.values()].map(({ socket: _socket, buffer: _buffer, idleTimer: _timer, ...safe }) => safe);
    }
    addMessage(direction, connectionId, raw) {
        const parsed = (0, protocol_1.parseFrame)(raw);
        const connection = this.connections.get(connectionId);
        const message = {
            id: (0, node_crypto_1.randomUUID)(),
            direction,
            connectionId,
            deviceId: parsed.deviceId || connection?.deviceId,
            timestamp: new Date().toISOString(),
            raw,
            kind: parsed.kind,
            fields: parsed.fields,
        };
        this.messages.unshift(message);
        if (this.messages.length > this.maxMessages)
            this.messages.length = this.maxMessages;
        return message;
    }
    listMessages(filters) {
        const limit = Math.min(Math.max(filters.limit || 100, 1), 1000);
        return this.messages
            .filter((m) => !filters.deviceId || m.deviceId === filters.deviceId)
            .filter((m) => !filters.direction || m.direction === filters.direction.toUpperCase())
            .filter((m) => !filters.kind || m.kind === filters.kind.toUpperCase())
            .slice(0, limit);
    }
}
exports.GatewayStore = GatewayStore;
