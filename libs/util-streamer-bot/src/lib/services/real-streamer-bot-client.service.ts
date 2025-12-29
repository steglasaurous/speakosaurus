import { StreamerbotClient, StreamerbotEventName } from '@streamerbot/client';
import { IStreamerBotClient } from './streamer-bot-client.interface';

/**
 * Wrapper around the real StreamerbotClient to implement IStreamerBotClient interface.
 */
export class RealStreamerBotClient implements IStreamerBotClient {
  private client: StreamerbotClient;

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
      immediate: true,
      autoReconnect: true,
      retries: -1, // Infinite retries
      logLevel: 'debug',
      onConnect: () => {
        console.log('Connected to Streamer.bot');
      },
      onError: (error) => {
        console.error('Streamer.bot connection error:', error);
      },
    });
  }

  on(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void {
    this.client.on(eventType, callback);
  }

  off(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void {
    // Need to find what the right way of doing this is.
    //this.client.off(eventType, callback);
  }
}

