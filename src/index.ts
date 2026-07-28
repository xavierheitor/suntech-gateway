import 'dotenv/config';
import { GatewayStore } from './store';
import { SuntechTcpServer } from './tcp-server';
import { createHttpApp } from './http-server';

async function bootstrap(): Promise<void> {
  const httpPort = Number(process.env.HTTP_PORT || 3000);
  const tcpPort = Number(process.env.TCP_PORT || 7777);
  const tcpHost = process.env.TCP_HOST || '0.0.0.0';
  const maxMessages = Number(process.env.MAX_MESSAGES || 1000);

  const store = new GatewayStore(maxMessages);
  const tcp = new SuntechTcpServer(store, tcpHost, tcpPort);
  await tcp.start();

  const app = createHttpApp(store, tcp);
  app.listen(httpPort, '0.0.0.0', () => {
    console.log(`[HTTP] API em http://0.0.0.0:${httpPort}`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar gateway:', error);
  process.exit(1);
});
