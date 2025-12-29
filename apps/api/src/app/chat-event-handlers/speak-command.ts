import { Injectable } from "@nestjs/common";
import { StreamerBotEvent, StreamerBotService } from "@streamtools/util-streamer-bot";
import { DrizzleService } from "nestjs-drizzle/sqlite";
import * as schema from '../database/schema';
import { VoiceProviderService } from "../services/voice-providers/voice-provider.service";

@Injectable()
export class SpeakCommand {
    constructor(
        private readonly streamerBotService: StreamerBotService, 
        private readonly drizzleService: DrizzleService<typeof schema>,
        private readonly voiceProviderService: VoiceProviderService
    ) {
        this.streamerBotService.events$.subscribe({
            next: (streamerbotEvent: StreamerBotEvent) => {
                this.handle(streamerbotEvent);
            },
            error: (error: any) => {
                console.error(error);
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
        // Assemble using the text "parts" of the message, filtering out emotes.
        // Later we might want to make this optional to read emotes or not.
        const voice = await this.voiceProviderService.getVoice('JBFqnCBsd6RMkjVDRZzb', 'elevenlabs');
        if (!voice) {
            console.error('Voice not found');
            return;
        }

        const message = this.sanitizeMessage(data);
        await this.voiceProviderService.speak(voice, message);
    }

    handleFirstWord(data: any) {
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
        let output = '';
        for (const part of data.parts) {
            if (part.type === 'text') {
                output += part.text;
            }
        }

        return output;
    }
}