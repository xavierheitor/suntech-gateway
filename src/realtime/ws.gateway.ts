import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { EventBus } from '../common/event-bus';
import type { GatewayEventName } from '../types';

const BROADCAST_EVENTS: GatewayEventName[] = [
  'connection.created',
  'connection.closed',
  'connection.updated',
  'message.received',
  'message.sent',
];

/**
 * Gateway WebSocket: retransmite eventos do EventBus para clientes do Console TCP.
 */
export class RealtimeGateway {
  private readonly wss: WebSocketServer;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    httpServer: HttpServer,
    private readonly events: EventBus,
    path = '/ws',
  ) {
    this.wss = new WebSocketServer({ server: httpServer, path });
    this.wss.on('connection', (socket) => this.onClient(socket));
    this.bindEvents();
    console.log(`[WS] WebSocket em ${path}`);
  }

  private onClient(socket: WebSocket): void {
    socket.send(JSON.stringify({ event: 'connected', payload: { ok: true, timestamp: new Date().toISOString() } }));
  }

  private bindEvents(): void {
    for (const event of BROADCAST_EVENTS) {
      const unsubscribe = this.events.on(event, (payload) => {
        this.broadcast(event, payload);
      });
      this.unsubscribers.push(unsubscribe);
    }
  }

  private broadcast(event: string, payload: unknown): void {
    const data = JSON.stringify({ event, payload });
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  }

  close(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.wss.close();
  }
}
