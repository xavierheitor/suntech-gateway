import { EventEmitter } from 'node:events';
import type {
  ConnectionEventPayload,
  GatewayEventName,
  MessageEventPayload,
} from '../types';

export type GatewayEventMap = {
  'connection.created': ConnectionEventPayload;
  'connection.closed': ConnectionEventPayload;
  'connection.updated': ConnectionEventPayload;
  'message.received': MessageEventPayload;
  'message.sent': MessageEventPayload;
};

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit<K extends GatewayEventName>(event: K, payload: GatewayEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends GatewayEventName>(event: K, listener: (payload: GatewayEventMap[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  off<K extends GatewayEventName>(event: K, listener: (payload: GatewayEventMap[K]) => void): void {
    this.emitter.off(event, listener);
  }
}
