"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const store_1 = require("./store");
const tcp_server_1 = require("./tcp-server");
const http_server_1 = require("./http-server");
async function bootstrap() {
    const httpPort = Number(process.env.HTTP_PORT || 3000);
    const tcpPort = Number(process.env.TCP_PORT || 7777);
    const tcpHost = process.env.TCP_HOST || '0.0.0.0';
    const maxMessages = Number(process.env.MAX_MESSAGES || 1000);
    const store = new store_1.GatewayStore(maxMessages);
    const tcp = new tcp_server_1.SuntechTcpServer(store, tcpHost, tcpPort);
    await tcp.start();
    const app = (0, http_server_1.createHttpApp)(store, tcp);
    app.listen(httpPort, '0.0.0.0', () => {
        console.log(`[HTTP] API em http://0.0.0.0:${httpPort}`);
    });
}
bootstrap().catch((error) => {
    console.error('Falha ao iniciar gateway:', error);
    process.exit(1);
});
