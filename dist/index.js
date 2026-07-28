"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_http_1 = require("node:http");
const event_bus_1 = require("./common/event-bus");
const database_1 = require("./persistence/database");
const connection_repository_1 = require("./persistence/connection.repository");
const message_repository_1 = require("./persistence/message.repository");
const connection_manager_1 = require("./connection/connection.manager");
const connection_service_1 = require("./connection/connection.service");
const connection_controller_1 = require("./connection/connection.controller");
const tcp_server_1 = require("./tcp/tcp-server");
const http_server_1 = require("./http/http-server");
const ws_gateway_1 = require("./realtime/ws.gateway");
async function bootstrap() {
    const httpPort = Number(process.env.HTTP_PORT || 3000);
    const tcpPort = Number(process.env.TCP_PORT || 7777);
    const tcpHost = process.env.TCP_HOST || '0.0.0.0';
    const db = (0, database_1.createDatabase)(process.env.DATABASE_PATH || './data/gateway.db');
    const connectionRepo = new connection_repository_1.ConnectionRepository(db);
    const messageRepo = new message_repository_1.MessageRepository(db);
    connectionRepo.markAllDisconnected(new Date().toISOString());
    const events = new event_bus_1.EventBus();
    const manager = new connection_manager_1.ConnectionManager(connectionRepo, messageRepo, events);
    const service = new connection_service_1.ConnectionService(manager);
    const controller = new connection_controller_1.ConnectionController(service, manager);
    const tcp = new tcp_server_1.SuntechTcpServer(manager, tcpHost, tcpPort);
    await tcp.start();
    const app = (0, http_server_1.createHttpApp)(controller);
    const httpServer = (0, node_http_1.createServer)(app);
    new ws_gateway_1.RealtimeGateway(httpServer, events, '/ws');
    httpServer.listen(httpPort, '0.0.0.0', () => {
        console.log(`[HTTP] API + Console em http://0.0.0.0:${httpPort}`);
        console.log(`[HTTP] Console TCP: http://0.0.0.0:${httpPort}/console`);
    });
}
bootstrap().catch((error) => {
    console.error('Falha ao iniciar gateway:', error);
    process.exit(1);
});
