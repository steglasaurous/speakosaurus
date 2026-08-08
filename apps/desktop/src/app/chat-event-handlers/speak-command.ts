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
        // Check if user is in the ignore list
        if (await this.isUserIgnored(data.user.name)) {
            this.logger.log('User is in ignore list, skipping message', { userId: data.user.id, username: data.user.name });
            return;
        }

        // Look for a matching user record.
        let user = await this.usersService.getUser(data.user.id);
        let voice: Voice | null = null;
        if (user) {
            if (user.ttsVoiceId && user.ttsProviderName) {
                voice = await this.voiceProviderService.getVoice(user.ttsVoiceId, user.ttsProviderName);
                if (!voice) {
                    this.logger.log(`Assigned voice not found for user`, { userId: data.user.id, voiceId: user.ttsVoiceId, providerName: user.ttsProviderName });
                }
            }
        } else {
            // Create a new user record with defaults.
            this.logger.log(`Creating new user record with defaults`, { userId: data.user.id, username: data.user.name });
            user = await this.usersService.createUser(data.user.id, data.user.name);
        }

        // An explicitly assigned user voice takes precedence over pronoun defaults.
        if (!voice) {
            voice = await this.voiceProviderService.getPronounDefaultVoice(user.pronouns);
        }
        if (!voice) {
            voice = await this.voiceProviderService.getDefaultVoice();
        }


        const mode = await this.settingsService.getSetting('mode');
        switch (mode.value) {
            case 'trigger': {
                if (! await this.messageContainsTrigger(data.message.message)) {
                    return;
                }
                break;
            }
            case 'off': {
                return;
            }
            case 'always': {
                // Check if the line starts with an exclamation point.  If it does, ignore it.
                if (data.message.message.startsWith('!') && ! await this.messageContainsTrigger(data.message.message)) {
                    return;
                }
                break;
            }
        }

        let message = await this.sanitizeMessage(data);
        if (message.length === 0) {
            this.logger.log('Message is empty, skipping', { userId: data.user.id, username: data.user.name });
            return;
        }
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

    async handleFirstWord(data: any) {
        // Check if user is in the ignore list
        if (await this.isUserIgnored(data.user.name)) {
            this.logger.log('User is in ignore list, skipping first word', { userId: data.user.id, username: data.user.name });
            return;
        }

        // Get the user record
        let user = await this.usersService.getUser(data.user.id);
        if (!user) {
            // Create a new user record with defaults if it doesn't exist
            this.logger.log(`Creating new user record for first word`, { userId: data.user.id, username: data.user.name });
            user = await this.usersService.createUser(data.user.id, data.user.name);
        }

        // Check if welcoming is disabled for this user
        if (user.disableWelcome) {
            this.logger.log('Welcome disabled for user, skipping first word', { userId: data.user.id, username: data.user.name });
            return;
        }

        // Get the default intro voice from settings
        const defaultIntroVoiceSetting = await this.settingsService.getSetting(Setting.DEFAULT_INTRO_VOICE);
        let introVoice: Voice;

        if (defaultIntroVoiceSetting && defaultIntroVoiceSetting.value) {
            try {
                const defaultIntroVoiceValue = JSON.parse(defaultIntroVoiceSetting.value);
                const voice = await this.voiceProviderService.getVoice(defaultIntroVoiceValue.voiceId, defaultIntroVoiceValue.providerName);
                if (voice) {
                    introVoice = voice;
                } else {
                    // Voice not found, fall back to default
                    this.logger.log('Default intro voice not found, falling back to default voice');
                    introVoice = await this.voiceProviderService.getDefaultVoice();
                }
            } catch (error) {
                this.logger.warn('Failed to parse default intro voice setting, falling back to default voice', error);
                introVoice = await this.voiceProviderService.getDefaultVoice();
            }
        } else {
            // No intro voice setting, use default voice
            introVoice = await this.voiceProviderService.getDefaultVoice();
        }

        // Determine the message to speak
        let message: string;
        let isCustomIntro = false;
        if (user.customIntros && user.customIntros.length > 0) {
            // Pick a random custom intro
            const randomIndex = Math.floor(Math.random() * user.customIntros.length);
            message = user.customIntros[randomIndex].introText;
            isCustomIntro = true;
        } else {
            // Use default welcome message
            const ttsName = user.ttsName || data.user.name;
            message = `Welcome ${ttsName}`;
        }

        // Trigger StreamerBot action if configured
        const streamerBotActionIntroSetting = await this.settingsService.getSetting(Setting.STREAMERBOT_ACTION_INTRO);
        if (streamerBotActionIntroSetting && streamerBotActionIntroSetting.value) {
            const actionId = streamerBotActionIntroSetting.value;
            const username = data.user.name;
            try {
                await this.streamerBotManagerService.triggerAction(actionId, {
                    username: username,
                    message: message,
                    isCustomIntro: isCustomIntro,
                });
                this.logger.log('Triggered StreamerBot intro action', { actionId, username, message });
            } catch (error) {
                this.logger.warn('Failed to trigger StreamerBot intro action', error);
            }
        }

        // Speak the welcome message
        await this.voiceProviderService.speak(introVoice, message);
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
        let triggers: string[];
        try {
            // Replacing double backslashes with single backslashes to avoid JSON parsing errors.
            triggers = JSON.parse(triggerCommands.value.replace('\\\\', '\\'));
            if (!Array.isArray(triggers)) {
                this.logger.warn('Trigger commands is not an array, returning original message', { triggerCommands: triggerCommands.value });
                return output;
            }
        } catch (error) {
            this.logger.error('Error parsing trigger commands JSON in sanitizeMessage', { error, triggerCommands: triggerCommands.value });
            return output;
        }
        for (const trigger of triggers) {
            if (output.startsWith(trigger + ' ')) {
                output = output.replace(trigger + ' ', '');
            }
        }

        return output.trim();
    }

    /**
     * Check if a user is in the ignored users list
     * @param username - The username to check (case-insensitive)
     * @returns true if the user is ignored, false otherwise
     */
    private async isUserIgnored(username: string): Promise<boolean> {
        try {
            const ignoredUsersSetting = await this.settingsService.getSetting(Setting.IGNORED_USERS);
            if (!ignoredUsersSetting || !ignoredUsersSetting.value) {
                return false;
            }

            const ignoredUsers: string[] = JSON.parse(ignoredUsersSetting.value);
            if (!Array.isArray(ignoredUsers)) {
                return false;
            }

            // Check if the username (lowercase) is in the ignored list
            const usernameLower = username.toLowerCase();
            return ignoredUsers.some(ignoredUser => ignoredUser.toLowerCase() === usernameLower);
        } catch (error) {
            this.logger.warn('Error checking ignored users list', error);
            return false;
        }
    }

    private async messageContainsTrigger(message: string): Promise<boolean> {
        const triggerCommands = await this.settingsService.getSetting('triggerCommands');
        if (!triggerCommands) {
            this.logger.warn('Trigger commands are not set');
            return false;
        }
        let triggers: string[];
        try {
            // Replacing double backslashes with single backslashes to avoid JSON parsing errors.
            triggers = JSON.parse(triggerCommands.value.replace('\\\\', '\\'));
            if (!Array.isArray(triggers)) {
                this.logger.warn('Trigger commands is not an array, ignoring message', { triggerCommands: triggerCommands.value });
                return false;
            }
        } catch (error) {
            this.logger.error('Error parsing trigger commands JSON', { error, triggerCommands: triggerCommands.value });
            return false;
        }

        for (const trigger of triggers) {
            if (message.toLowerCase().startsWith(trigger.toLowerCase() + ' ')) {
                return true;
            }
        }

        // Trigger wasn't present, ignore it.
        this.logger.log('Trigger not found, ignoring message', { message: message, triggerCommands: triggerCommands.value });
        return false;
    }
}
