import { DoActionResponse, GetActionsResponse, StreamerbotClient, StreamerbotEventName } from '@streamerbot/client';
import { IStreamerBotClient } from './streamer-bot-client.interface';

/**
 * Wrapper around the real StreamerbotClient to implement IStreamerBotClient interface.
 */
export class RealStreamerBotClient implements IStreamerBotClient {
  private client: StreamerbotClient;
  private connectedCallback!: () => void;
  private disconnectedCallback!: (error?: any) => void;

  constructor(wsUrl: string) {
    // Parse the WebSocket URL to extract host and port
    const url = new URL(wsUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || (url.protocol === 'wss:' ? 443 : 80);
    const scheme = url.protocol === 'wss:' ? 'wss' : 'ws';
    
    this.client = new StreamerbotClient({
      host,
      port,
      scheme,
      immediate: false,
      autoReconnect: true,
      retries: -1, // Infinite retries
      logLevel: 'debug',
      onConnect: () => {
        this.connected();
      },
      onError: (error) => {
        this.disconnected(error);
      },

    });
  }

  async getActions(): Promise<GetActionsResponse> {
    return this.client.getActions();
  }

  async triggerAction(actionId: string, args: Record<string, any>): Promise<DoActionResponse> {
    return this.client.doAction(actionId, args);
  }

  connect(): void {
    this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  on(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void {
    this.client.on(eventType, callback);
  }

  off(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void {
    // Need to find what the right way of doing this is.
    //this.client.off(eventType, callback);
  }

  

  onConnect(callback: () => void): void {
    this.connectedCallback = callback;
  }

  onDisconnect(callback: (error?: any) => void): void {
    this.disconnectedCallback = callback;
  }

  private connected(): void {
    this.connectedCallback();
  }

  private disconnected(error: any): void {
    this.disconnectedCallback(error);
  }
}

