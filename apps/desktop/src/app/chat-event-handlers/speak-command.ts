import { Injectable, Logger } from "@nestjs/common";
import { StreamerBotEvent } from "@streamtools/util-streamer-bot";
import { VoiceProviderService } from "../services/voice-providers/voice-provider.service";
import { Setting, SettingsService } from "../services/settings.service";
import { UsersService } from "../services/users.service";
import { Voice } from "../services/voice-providers/voice.interface";
import { StreamerBotManagerService } from "../services/streamer-bot-manager.service";

@Injectable()
export class SpeakCommand {
    private readonly logger: Logger = new Logger(SpeakCommand.constructor.name);
    private lastMessageUserId: string | null = null;
    private lastMessageTime = 0;

    constructor(
        private readonly streamerBotManagerService: StreamerBotManagerService, 
        private readonly voiceProviderService: VoiceProviderService,
        private readonly settingsService: SettingsService,
        private readonly usersService: UsersService
    ) {
        this.streamerBotManagerService.events$.subscribe({
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
        // Look for a matching user record.
        let user = await this.usersService.getUser(data.user.id);
        let voice: Voice | null = null;
        if (user) {
            voice = await this.voiceProviderService.getVoice(user.ttsVoiceId, user.ttsProviderName);
            if (!voice) {
                this.logger.log(`Voice not found for user, falling back to default voice`, { userId: data.user.id, voiceId: user.ttsVoiceId, providerName: user.ttsProviderName });
            }
        } else {
            // Create a new user record with defaults.
            this.logger.log(`Creating new user record with defaults`, { userId: data.user.id, username: data.user.name });
            user = await this.usersService.createUser(data.user.id, data.user.name);
        }
        if (!voice) {
            voice = await this.voiceProviderService.getDefaultVoice();
        }
        
        
        const mode = await this.settingsService.getSetting('mode');
        switch (mode.value) {
            case 'trigger': {
                const triggerCommands = await this.settingsService.getSetting('triggerCommands');
                if (!triggerCommands) {
                    this.logger.warn('Mode is set to trigger, but trigger commands are not set');
                    return;
                }
                const triggers = JSON.parse(triggerCommands.value);
                let triggerFound = false;
                for (const trigger of triggers) {
                    if (data.message.message.toLowerCase().startsWith(trigger.toLowerCase())) {
                        triggerFound = true;
                        break;
                    }
                }
                if (!triggerFound) {
                    // Trigger wasn't present, ignore it.
                    this.logger.log('Trigger not found, ignoring message', { message: data.message.message, triggerCommands: triggerCommands.value });
                    return;
                }
                break;
            }
            case 'off': {
                return;
            }
        }

        let message = await this.sanitizeMessage(data);

        const sameUserOmit = await this.settingsService.getSetting(Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER);
        const sameUserTimeout = await this.settingsService.getSetting(Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT);

        if (sameUserOmit.value === 'true') {
            const sameUserTimeoutValue = parseInt(sameUserTimeout.value);
            if (! (this.lastMessageUserId === data.user.id && Date.now() - this.lastMessageTime < sameUserTimeoutValue)) {
                const messagePrefix = await this.settingsService.getSetting(Setting.CHAT_MESSAGE_PREFIX);
                message = messagePrefix.value.replace('{ttsName}', user.ttsName) + ' ' + message;
            }
        }
        
        await this.voiceProviderService.speak(voice, message);
        this.lastMessageUserId = data.user.id;
        this.lastMessageTime = Date.now();
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
    private async sanitizeMessage(data: any): Promise<string> {
        // Assemble using the text "parts" of the message, filtering out emotes.
        // Later we might want to make this optional to read emotes or not.
        let output = '';
        for (const part of data.parts) {
            if (part.type === 'text') {
                output += part.text;
            }
        }

        // Strip the trigger command from the message.
        const triggerCommands = await this.settingsService.getSetting(Setting.TRIGGER_COMMANDS);
        if (!triggerCommands) {
            this.logger.warn('Trigger commands not found, returning original message');
            return output;
        }
        const triggers = JSON.parse(triggerCommands.value);
        for (const trigger of triggers) {
            if (output.startsWith(trigger + ' ')) {
                output = output.replace(trigger + ' ', '');
            }
        }

        return output;
    }
}