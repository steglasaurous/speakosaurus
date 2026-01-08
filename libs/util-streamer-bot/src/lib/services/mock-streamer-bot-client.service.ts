import { Injectable } from '@angular/core';
import { DoActionResponse, GetActionsResponse, StreamerbotEventName } from '@streamerbot/client';
import { IStreamerBotClient } from './streamer-bot-client.interface';

type EventCallback = (payload: { data?: any }) => void;

/**
 * Mock StreamerBot client for development and testing.
 * Allows generating test events programmatically.
 */
export class MockStreamerBotClient implements IStreamerBotClient {
  private eventSubscriptions = new Map<StreamerbotEventName, Set<EventCallback>>();
  private connectedCallback!: () => void;
  private disconnectedCallback!: (error?: any) => void;
  constructor() {
    console.log('MockStreamerBotClient initialized - using dummy connection for development');
  }

  /**
   * Subscribe to a StreamerBot event.
   */
  on(eventType: StreamerbotEventName, callback: EventCallback): void {
    if (!this.eventSubscriptions.has(eventType)) {
      this.eventSubscriptions.set(eventType, new Set());
    }
    this.eventSubscriptions.get(eventType)!.add(callback);
  }

  /**
   * Unsubscribe from an event.
   */
  off(eventType: StreamerbotEventName, callback: EventCallback): void {
    const callbacks = this.eventSubscriptions.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  onConnect(callback: () => void): void {
    this.connectedCallback = callback;
  }

  onDisconnect(callback: (error?: any) => void): void {
    this.disconnectedCallback = callback;
  }

  connect(): void {
    this.connectedCallback();
  }

  async disconnect(): Promise<void> {
    // For mock client, just call the disconnected callback
    if (this.disconnectedCallback) {
      this.disconnectedCallback();
    }
  }

  async getActions(): Promise<GetActionsResponse> {
    return {
      id: 'mock_action_id',
      status: 'ok',
      actions: [],
      count: 0,
    };
  }

  async triggerAction(actionId: string, args: Record<string, any>): Promise<DoActionResponse> {
    return {
      id: 'mock_action_id',
      status: 'ok',
      args,
      customEventResponseArgs: {},
    };
  }

  /**
   * Generate a test event programmatically.
   * Use this method to simulate StreamerBot events during development.
   * 
   * @param eventType The type of event to generate
   * @param data The event data payload
   * 
   * @example
   * ```typescript
   * mockClient.emitEvent('General.Custom', {
   *   type: 'FirstWords',
   *   username: 'testuser',
   *   profilePic: 'https://example.com/avatar.jpg'
   * });
   * ```
   */
  emitEvent(eventType: StreamerbotEventName, data?: any): void {
    console.log(`[MockStreamerBotClient] Emitting event: ${eventType}`, data);
    const callbacks = this.eventSubscriptions.get(eventType);
    if (callbacks) {
      const payload = { data };
      callbacks.forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[MockStreamerBotClient] Error in callback for ${eventType}:`, error);
        }
      });
    } else {
      console.warn(`[MockStreamerBotClient] No subscribers for event type: ${eventType}`);
    }
  }

  /**
   * Generate a Twitch chat message event.
   * 
   * @param username The username of the chat message sender
   * @param message The message text
   * @param channel The channel name (optional)
   * @param color The user's color (optional)
   */
  emitChatMessage(username: string, message: string, channel?: string, color?: string): void {
    this.emitEvent('Twitch.ChatMessage', {
      message: {
        channel: channel || 'testchannel',
        username,
        displayName: username,
        message,
        color: color || '#000000',
      },
      user: {
        name: username,
        displayName: username,
        login: username.toLowerCase(),
        color: color || '#000000',
      },
      text: message,
      messageId: `mock_${Date.now()}`,
    });
  }

  /**
   * Generate a custom event.
   * 
   * @param data The custom event data
   */
  emitCustomEvent(data: any): void {
    this.emitEvent('General.Custom', data);
  }

  /**
   * Generate a Pulsoid heart rate pulse event.
   * 
   * @param heartRate The heart rate value
   */
  emitHeartRatePulse(heartRate: number): void {
    this.emitEvent('Pulsoid.HeartRatePulse', {
      heartRate,
    });
  }

  /**
   * Get a list of all subscribed event types.
   */
  getSubscribedEvents(): StreamerbotEventName[] {
    return Array.from(this.eventSubscriptions.keys());
  }

  /**
   * Check if a specific event type has any subscribers.
   */
  hasSubscribers(eventType: StreamerbotEventName): boolean {
    const callbacks = this.eventSubscriptions.get(eventType);
    return callbacks ? callbacks.size > 0 : false;
  }
}

