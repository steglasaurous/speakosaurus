import { StreamerbotEventName } from '@streamerbot/client';
import { Subject, Observable } from 'rxjs';
import { IStreamerBotClient } from './streamer-bot-client.interface';
import { RealStreamerBotClient } from './real-streamer-bot-client.service';
import { MockStreamerBotClient } from './mock-streamer-bot-client.service';

export interface StreamerBotEvent {
  eventType: string;
  data: any;
}

export class StreamerBotService {
  private client: IStreamerBotClient;
  private eventSubject = new Subject<StreamerBotEvent>();
  private connectedSubject = new Subject<boolean>();
  private subscribedEvents = new Set<string>();

  
  /**
   * Observable that emits StreamerBot events.
   * Subscribe to this to receive events from StreamerBot.
   */
  public readonly events$: Observable<StreamerBotEvent> = this.eventSubject.asObservable();
  /**
   * Observable that emits the connection status of StreamerBot.
   * Subscribe to this to receive connection status updates.
   */
  public readonly connected$: Observable<boolean> = this.connectedSubject.asObservable();

  constructor(
    private wsUrl = 'ws://localhost:8080', 
    private useMock = false
  ) {
    // Initialize the appropriate client based on configuration
    if (this.useMock) {
      this.client = new MockStreamerBotClient();
    } else {
      this.client = new RealStreamerBotClient(this.wsUrl);
    }
    this.client.onConnect(() => {
      this.connectedSubject.next(true);
    });
    this.client.onDisconnect((error) => {
      this.connectedSubject.next(false);
    });
  }

  connect(): void {
    this.client.connect();
  }

  subscribeToEvent(eventType: StreamerbotEventName): void {
    if (this.subscribedEvents.has(eventType)) {
      return; // Already subscribed
    }

    this.subscribedEvents.add(eventType);
    this.client.on(eventType, (payload) => {
      if (payload.data) {
        this.eventSubject.next({ eventType, data: payload.data });
      }
    });
  }

  /**
   * Get the mock client if using mock mode.
   * This allows you to programmatically generate test events.
   * 
   * @returns The MockStreamerBotClient instance, or null if using real client
   * 
   * @example
   * ```typescript
   * const mockClient = streamerBotService.getMockClient();
   * if (mockClient) {
   *   mockClient.emitEvent('General.Custom', { type: 'FirstWords', username: 'testuser' });
   * }
   * ```
   */
  getMockClient(): MockStreamerBotClient | null {
    return this.client instanceof MockStreamerBotClient ? this.client : null;
  }
}
