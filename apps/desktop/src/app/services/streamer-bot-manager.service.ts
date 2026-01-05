import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StreamerBotService, StreamerBotEvent } from '@streamtools/util-streamer-bot';
import { SettingsService, Setting } from './settings.service';
import { Subject, Observable } from 'rxjs';

@Injectable()
export class StreamerBotManagerService implements OnModuleInit {
    private streamerBotService: StreamerBotService | null = null;
    private logger: Logger = new Logger(StreamerBotManagerService.constructor.name);
    private eventSubject = new Subject<StreamerBotEvent>();
    private currentSubscription: any = null;

    // Expose events$ observable that stays consistent even when underlying service changes
    public readonly events$: Observable<StreamerBotEvent> = this.eventSubject.asObservable();

    constructor(private readonly settingsService: SettingsService) {}

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

        // Unsubscribe from old service if it exists
        if (this.currentSubscription) {
            this.currentSubscription.unsubscribe();
            this.currentSubscription = null;
        }

        // Create new service
        try {
            const useMock = process.env.STREAMERBOT_USE_MOCK === 'true';
            this.streamerBotService = new StreamerBotService(wsUrl, useMock);

            // Subscribe to events
            this.streamerBotService.subscribeToEvent('Twitch.ChatMessage');
            this.streamerBotService.subscribeToEvent('Twitch.FirstWord');

            // Forward events from the underlying service to our subject
            this.currentSubscription = this.streamerBotService.events$.subscribe({
                next: (event: StreamerBotEvent) => {
                    this.eventSubject.next(event);
                },
                error: (error: any) => {
                    this.logger.warn('Streamerbot event stream error', error);
                },
            });

            this.logger.log(`StreamerBotService initialized with URL: ${wsUrl}`);
        } catch (error) {
            this.logger.error('Failed to initialize StreamerBotService', error);
            this.streamerBotService = null;
        }
    }
}

