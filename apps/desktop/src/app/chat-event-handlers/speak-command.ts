import { Injectable, Logger } from "@nestjs/common";
import { StreamerBotEvent, StreamerBotService } from "@streamtools/util-streamer-bot";
import { DrizzleService } from "nestjs-drizzle/sqlite";
import * as schema from '../database/schema';
import { VoiceProviderService } from "../services/voice-providers/voice-provider.service";
import { SettingsService } from "../services/settings.service";

@Injectable()
export class SpeakCommand {
    private readonly logger: Logger = new Logger(SpeakCommand.constructor.name);
    constructor(
        private readonly streamerBotService: StreamerBotService, 
        private readonly drizzleService: DrizzleService<typeof schema>,
        private readonly voiceProviderService: VoiceProviderService,
        private readonly settingsService: SettingsService
    ) {
        this.streamerBotService.events$.subscribe({
            next: (streamerbotEvent: StreamerBotEvent) => {
                this.handle(streamerbotEvent);
            },
            error: (error: any) => {
                this.logger.warn('Streamerbot event handler error', error);
            },
        });
    }

    handle(event: StreamerBotEvent) {
        switch (event.eventType) {
            case 'Twitch.ChatMessage':
                this.handleChatMessage(event.data);
                break;
            case 'Twitch.FirstWord':
                this.handleFirstWord(event.data);
                break;
        }
    }

    async handleChatMessage(data: any) {
        const mode = await this.settingsService.getSetting('mode');
        switch (mode.value) {
            case 'trigger': {
                const triggerCommands = await this.settingsService.getSetting('triggerCommands');
                if (!triggerCommands) {
                    this.logger.warn('Mode is set to trigger, but trigger commands are not set');
                    return;
                }
    
                if (! data.message.message.toLowerCase().startsWith(triggerCommands.value.toLowerCase())) {
                    // Trigger wasn't present, ignore it.
                    return;
                }
                break;
            }
            case 'off': {
                return;
            }
        }
        
        // Look for a matching user record.
        
        const voice = await this.voiceProviderService.getVoice('JBFqnCBsd6RMkjVDRZzb', 'elevenlabs');
        if (!voice) {
            console.error('Voice not found');
            return;
        }

        const message = this.sanitizeMessage(data);
        await this.voiceProviderService.speak(voice, message);
    }

    handleFirstWord(data: any) {
        // FIXME: Implement this.
        console.log('first word');
        console.log(data);
        console.log('**********************************************************');
    }

    /**
     * 
     * @param data - The data from the Twitch.ChatMessage or Twitch.FirstWord event.
     * @returns - The sanitized message string.
     */
    private sanitizeMessage(data: any): string {
        // Assemble using the text "parts" of the message, filtering out emotes.
        // Later we might want to make this optional to read emotes or not.
        let output = '';
        for (const part of data.parts) {
            if (part.type === 'text') {
                output += part.text;
            }
        }

        return output;
    }
}