import 'dotenv/config';
import { createServer } from 'node:http';
import { EventBus } from './common/event-bus';
import { createDatabase } from './persistence/database';
import { ConnectionRepository } from './persistence/connection.repository';
import { MessageRepository } from './persistence/message.repository';
import { ConnectionManager } from './connection/connection.manager';
import { ConnectionService } from './connection/connection.service';
import { ConnectionController } from './connection/connection.controller';
import { SuntechTcpServer } from './tcp/tcp-server';
import { createHttpApp } from './http/http-server';
import { RealtimeGateway } from './realtime/ws.gateway';

async function bootstrap(): Promise<void> {
  const httpPort = Number(process.env.HTTP_PORT || 3000);
  const tcpPort = Number(process.env.TCP_PORT || 7777);
  const tcpHost = process.env.TCP_HOST || '0.0.0.0';

  const db = createDatabase(process.env.DATABASE_PATH || './data/gateway.db');
  const connectionRepo = new ConnectionRepository(db);
  const messageRepo = new MessageRepository(db);
  connectionRepo.markAllDisconnected(new Date().toISOString());

  const events = new EventBus();
  const manager = new ConnectionManager(connectionRepo, messageRepo, events);
  const service = new ConnectionService(manager);
  const controller = new ConnectionController(service, manager);

  const tcp = new SuntechTcpServer(manager, tcpHost, tcpPort);
  await tcp.start();

  const app = createHttpApp(controller);
  const httpServer = createServer(app);
  new RealtimeGateway(httpServer, events, '/ws');

  httpServer.listen(httpPort, '0.0.0.0', () => {
    console.log(`[HTTP] API + Console em http://0.0.0.0:${httpPort}`);
    console.log(`[HTTP] Console TCP: http://0.0.0.0:${httpPort}/console`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar gateway:', error);
  process.exit(1);
});
