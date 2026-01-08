import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { StreamerBotService, StreamerBotEvent } from '@streamtools/util-streamer-bot';
import { SettingsService, Setting } from './settings.service';
import { Subject, Observable, Subscription } from 'rxjs';
import { StatusEventService } from './status-event.service';
import { DoActionResponse, GetActionsResponse } from '@streamerbot/client';

@Injectable()
export class StreamerBotManagerService implements OnModuleInit, OnModuleDestroy {
    private streamerBotService: StreamerBotService | null = null;
    private logger: Logger = new Logger(StreamerBotManagerService.constructor.name);
    private eventSubject = new Subject<StreamerBotEvent>();
    private connectedSubject = new Subject<boolean>();
    private currentSubscription: any = null;
    private connectedStatusSubscription: Subscription | null = null;
    private isConnected = false;
    private lastEventTime: number | null = null;

    // Expose events$ observable that stays consistent even when underlying service changes
    public readonly events$: Observable<StreamerBotEvent> = this.eventSubject.asObservable();
    public readonly connected$: Observable<boolean> = this.connectedSubject.asObservable();
    
    constructor(
      private readonly settingsService: SettingsService,
      private readonly statusEventService: StatusEventService,
    ) {}

    async onModuleInit() {
        // Initialize StreamerBotService with settings
        await this.updateStreamerBotService();
    }

    /**
     * Get the current StreamerBotService instance.
     * Returns null if not initialized or if the URL is not set.
     */
    getService(): StreamerBotService | null {
        return this.streamerBotService;
    }

    /**
     * Subscribe to a StreamerBot event type.
     * This is a pass-through to the underlying StreamerBotService.
     */
    subscribeToEvent(eventType: string): void {
        if (this.streamerBotService) {
            this.streamerBotService.subscribeToEvent(eventType as any);
        }
    }

    async getActions(): Promise<GetActionsResponse> {
        return this.streamerBotService?.getActions() || null;
    }

    async triggerAction(actionId: string, args: Record<string, any>): Promise<DoActionResponse> {
        return this.streamerBotService?.triggerAction(actionId, args) || null;
    }

    /**
     * Get the mock client if using mock mode.
     * This is a pass-through to the underlying StreamerBotService.
     */
    getMockClient() {
        return this.streamerBotService?.getMockClient() || null;
    }

    /**
     * Update the StreamerBotService based on the current settings.
     * This method is called on module init and when the URL setting changes.
     */
    async updateStreamerBotService(): Promise<void> {
        const urlSetting = await this.settingsService.getSetting(Setting.STREAMERBOT_WEBSOCKET_URL);
        const wsUrl = urlSetting?.value || urlSetting?.default || 'ws://localhost:8080';

        // Disconnect and cleanup old service if it exists
        if (this.streamerBotService) {
            try {
                await this.streamerBotService.disconnect();
            } catch (error) {
                this.logger.warn('Error disconnecting old StreamerBotService', error);
            }
        }

        // Unsubscribe from old service if it exists
        if (this.currentSubscription) {
            this.currentSubscription.unsubscribe();
            this.currentSubscription = null;
        }

        // Unsubscribe from connection status if it exists
        if (this.connectedStatusSubscription) {
            this.connectedStatusSubscription.unsubscribe();
            this.connectedStatusSubscription = null;
        }

        // Create new service
        try {
            const useMock = process.env.STREAMERBOT_USE_MOCK === 'true';
            this.streamerBotService = new StreamerBotService(wsUrl, useMock);
            
            // Subscribe to connection status changes and emit to status event service
            this.connectedStatusSubscription = this.streamerBotService.connected$.subscribe((connected: boolean) => {
                this.isConnected = connected;
                this.connectedSubject.next(connected);
                // Emit status update
                this.statusEventService.emitStatusUpdate({ 
                    streamerBotConnected: connected 
                });
            });

            this.streamerBotService.connect();

            // Subscribe to events
            this.streamerBotService.subscribeToEvent('Twitch.ChatMessage');
            this.streamerBotService.subscribeToEvent('Twitch.FirstWord');

            // Forward events from the underlying service to our subject
            this.currentSubscription = this.streamerBotService.events$.subscribe({
                next: (event: StreamerBotEvent) => {
                    this.isConnected = true;
                    this.lastEventTime = Date.now();
                    this.eventSubject.next(event);
                },
                error: (error: any) => {
                    this.logger.warn('Streamerbot event stream error', error);
                    // Consider disconnected if we haven't received events in 30 seconds
                    if (this.lastEventTime && Date.now() - this.lastEventTime > 30000) {
                        this.isConnected = false;
                    }
                },
            });

            this.logger.log(`StreamerBotService initialized with URL: ${wsUrl}`);
        } catch (error) {
            this.logger.error('Failed to initialize StreamerBotService', error);
            this.streamerBotService = null;
            this.isConnected = false;
        }
    }

    /**
     * Get the current connection status to Streamer.bot
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }

    async onModuleDestroy() {
        // Unsubscribe from subscriptions
        if (this.connectedStatusSubscription) {
            this.connectedStatusSubscription.unsubscribe();
        }
        if (this.currentSubscription) {
            this.currentSubscription.unsubscribe();
        }
        
        // Disconnect the service
        if (this.streamerBotService) {
            try {
                await this.streamerBotService.disconnect();
            } catch (error) {
                this.logger.warn('Error disconnecting StreamerBotService on destroy', error);
            }
        }
    }
}

