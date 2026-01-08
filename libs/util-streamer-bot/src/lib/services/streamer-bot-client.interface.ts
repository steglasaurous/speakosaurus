import { DoActionResponse, GetActionsResponse, StreamerbotAction, StreamerbotEventName } from '@streamerbot/client';

/**
 * Interface for StreamerBot client implementations.
 * Allows switching between real and mock implementations for testing.
 */
export interface IStreamerBotClient {
  /**
   * Get the actions available from streamer.bot.
   * @returns The actions available from streamer.bot.
   */
  getActions(): Promise<GetActionsResponse>;

  /**
   * Trigger a StreamerBot action.
   * @param actionId - The ID of the action to trigger.
   * @param args - The arguments to pass to the action.
   * @returns The response from the action.
   */
  triggerAction(actionId: string, args: Record<string, any>): Promise<DoActionResponse>;

  /**
   * Subscribe to a StreamerBot event.
   * @param eventType The event type to subscribe to
   * @param callback Function to call when the event is received
   */
  on(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void;

  /**
   * Unsubscribe from an event.
   * @param eventType The event type to unsubscribe from
   * @param callback The callback function to remove
   */
  off(eventType: StreamerbotEventName, callback: (payload: { data?: any }) => void): void;

  /**
   * When streamer.bot is connected.
   * 
   * @param callback 
   */
  onConnect(callback: () => void): void;

  /**
   * When streamer.bot is disconnected.
   * 
   * @param callback 
   */
  onDisconnect(callback: (error?: any) => void): void;

  /**
   * Connect to streamer.bot.
   */
  connect(): void;

  /**
   * Disconnect from streamer.bot.
   */
  disconnect(): Promise<void>;
}

