import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { VOICE_PROVIDERS } from "../../injection-tokens";
import { VoiceProvider } from "./voice-provider.interface";
import { Voice } from "./voice.interface";
import { AudioData } from "./audio-data.interface";
import { AudioProcessorService } from "../audio-processor.service";
import { Setting, SettingsService } from "../settings.service";
import { ElevenLabsVoiceProvider } from "./providers/elevenlabs.voice-provider";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { TTSMonsterVoiceProvider } from "./providers/tts-monster.voice-provider";
import { HttpService } from "@nestjs/axios";
import { TTSMonsterUnofficialVoiceProvider } from "./providers/tts-monster-unofficial.voice-provider";
import { AzureVoiceProvider } from "./providers/azure.voice-provider";
import { PiperVoiceProvider } from "./providers/piper.voice-provider";
import { StatusEventService } from "../status-event.service";

@Injectable()
export class VoiceProviderService implements OnModuleInit {
    private cachedVoices: Voice[] | null = null;
    private logger: Logger = new Logger(VoiceProviderService.constructor.name);
    private voiceProviders: VoiceProvider[] = [];
    private pendingMessages = 0;

    constructor(
        @Inject(VOICE_PROVIDERS) private readonly initialVoiceProviders: VoiceProvider[],
        private readonly audioProcessorService: AudioProcessorService,
        private readonly settingsService: SettingsService,
        private readonly httpService: HttpService,
        private readonly statusEventService: StatusEventService,
    ) {
        // Start with the initial providers (typically just SpeakerttsVoiceProvider)
        this.voiceProviders = [...this.initialVoiceProviders];
    }

    async onModuleInit() {
        // Check if ElevenLabs API key is set and add provider if available
        await this.updateElevenLabsProvider();
        await this.updateTTSMonsterProvider();
        await this.updateTTSMonsterUnofficialProvider();
        await this.updateAzureProvider();
        await this.updatePiperProvider();
    }

    async getVoices(forceReload = false): Promise<Voice[]> {
        // Return cached result if available and not forcing reload
        if (this.cachedVoices !== null && !forceReload) {
            return this.cachedVoices;
        }
        
        const output: Voice[] = [];
        for (const provider of this.voiceProviders) {
            let voices: Voice[] = [];
            try {
                voices = await provider.getVoices();
            } catch (error) {
                this.logger.error(`Failed to get voices from provider ${provider.providerName}`, error);
                continue;
            }
            
            for (const voice of voices) {
                output.push(voice);
            }
        }

        // Sort the voices by provider name then voice name
        output.sort((a, b) => {
            if (a.providerName === b.providerName) {
                return a.voiceName.localeCompare(b.voiceName);
            }
            return a.providerName.localeCompare(b.providerName);
        });

        // Update cache with latest results
        this.cachedVoices = output;

        return output;
    }

    async getVoice(voiceId: string, providerName: string): Promise<Voice | null> {
        const voices = await this.getVoices();
        const voice = voices.find(v => v.voiceId === voiceId && v.providerName === providerName);
        if (!voice) {
            return null;
        }
        return voice;
    }

    async getRenderedMessage(voice: Voice, message: string): Promise<AudioData> {
        const provider = this.voiceProviders.find(p => p.providerName === voice.providerName);
        
        if (!provider) {
            throw new Error(`Voice provider '${voice.providerName}' not found`);
        }
        this.logger.log('Getting rendered message', { message, voice });
        this.pendingMessages++;
        // Emit update
        this.statusEventService.emitStatusUpdate({ 
            pendingMessages: this.pendingMessages 
        });
        try {
            const audioData = await provider.getRenderedMessage(message, voice);
            this.pendingMessages--;
            // Emit update
            this.statusEventService.emitStatusUpdate({ 
                pendingMessages: this.pendingMessages 
            });
            return audioData;
        } catch (error) {
            this.pendingMessages--;
            // Emit update
            this.statusEventService.emitStatusUpdate({ 
                pendingMessages: this.pendingMessages 
            });
            throw error;
        }
    }

    /**
     * A convenience method to render a message and immediately add it to the audio processor queue.
     * @param voice 
     * @param message 
     */
    async speak(voice: Voice, message: string) {
        const audioData = await this.getRenderedMessage(voice, message);
        await this.audioProcessorService.addToQueue(audioData);
    }

    /**
     * Return the default voice to use in cases where no specific voice is specified.
     * 
     * A default voice is chosen as follows:
     * - If defaultVoice in settings is present, that is used.
     * - If no defaultVoice is present, the first available voice from speakertts is used.
     * - If no speakertts voices are available, use the first available voice from any provider.
     * - If no voices are available, throw an error.
     */
    async getDefaultVoice(): Promise<Voice> {
        const defaultVoiceSetting = await this.settingsService.getSetting(Setting.DEFAULT_VOICE);
        if (!defaultVoiceSetting || defaultVoiceSetting.value === null) {
            // We'll grab the first available voice from speakertts, as that's the built-in voices from either windows or mac.
            const voices = await this.getVoices();
            for (const voice of voices) {
                if (voice.providerName === 'speakertts') {
                    return voice;
                }
            }

            // If we don't have any speakertts voices, return the first one in voices.
            if (voices.length > 0) {
                return voices[0];
            }

            throw new Error('No voices are available - configure at least one voice provider');
        }

        const defaultVoiceValue = JSON.parse(defaultVoiceSetting.value);
        return await this.getVoice(defaultVoiceValue.voiceId, defaultVoiceValue.providerName);
    }

    /**
     * Update the ElevenLabs provider based on whether the API key is set in settings.
     * This method is called on module init and when the API key setting changes.
     */
    async updateElevenLabsProvider(): Promise<void> {
        const apiKeySetting = await this.settingsService.getSetting(Setting.ELEVENLABS_API_KEY);
        const apiKey = apiKeySetting?.value;

        // Remove existing ElevenLabs provider if present
        this.voiceProviders = this.voiceProviders.filter(
            provider => provider.providerName !== 'elevenlabs'
        );

        // Add ElevenLabs provider if API key is set
        if (apiKey && apiKey.trim() !== '') {
            try {
                const elevenLabsClient = new ElevenLabsClient({
                    apiKey: apiKey,
                });
                const elevenLabsProvider = new ElevenLabsVoiceProvider(elevenLabsClient);
                this.voiceProviders.push(elevenLabsProvider);
                this.logger.log('ElevenLabs provider added');
                // Clear cache so new voices are loaded
                this.cachedVoices = null;
            } catch (error) {
                this.logger.error('Failed to initialize ElevenLabs provider', error);
            }
        } else {
            this.logger.log('ElevenLabs provider not added - API key not set');
            // Clear cache so voices are refreshed
            this.cachedVoices = null;
        }
    }

    async updateTTSMonsterProvider(): Promise<void> {
        const apiKeySetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_API_KEY);
        const apiKey = apiKeySetting?.value;
        if (apiKey && apiKey.trim() !== '') {
            const ttsMonsterProvider = new TTSMonsterVoiceProvider(apiKey, this.httpService);
            this.voiceProviders.push(ttsMonsterProvider);
            this.logger.log('TTS Monster provider added');
            // Clear cache so new voices are loaded
            this.cachedVoices = null;
        } else {
            this.logger.log('TTS Monster provider not added - API key not set');
            // Clear cache so voices are refreshed
            this.cachedVoices = null;
        }
    }

    async updateTTSMonsterUnofficialProvider(): Promise<void> {
        const userIdSetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_UNOFFICIAL_USER_ID);
        const userId = userIdSetting?.value;
        const apiKeySetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_UNOFFICIAL_API_KEY);
        const apiKey = apiKeySetting?.value;
        if (userId && apiKey && userId.trim() !== '' && apiKey.trim() !== '') {
            // Remove existing TTS MonsterUnofficial provider if present
            this.voiceProviders = this.voiceProviders.filter(
                provider => provider.providerName !== 'ttsMonsterUnofficial'
            );

            const ttsMonsterUnofficialProvider = new TTSMonsterUnofficialVoiceProvider(userId, apiKey, this.httpService);
            this.voiceProviders.push(ttsMonsterUnofficialProvider);
            this.cachedVoices = null;
            this.logger.log('TTS MonsterUnofficial provider added');
        }
    }

    async updateAzureProvider(): Promise<void> {
        const apiKeySetting = await this.settingsService.getSetting(Setting.AZURE_SPEECH_KEY);
        const apiKey = apiKeySetting?.value;
        const regionSetting = await this.settingsService.getSetting(Setting.AZURE_SPEECH_REGION);
        const region = regionSetting?.value;
        const endpointSetting = await this.settingsService.getSetting(Setting.AZURE_ENDPOINT);
        const endpoint = endpointSetting?.value;
        if (apiKey && region && endpoint && apiKey.trim() !== '' && region.trim() !== '' && endpoint.trim() !== '') {
            const azureProvider = new AzureVoiceProvider(apiKey, region, endpoint);
            this.voiceProviders.push(azureProvider);
            this.cachedVoices = null;
            this.logger.log('Azure provider added');
        } else {
            this.logger.log('Azure provider not added - API key, region, or endpoint not set');
            // Clear cache so voices are refreshed
            this.cachedVoices = null;
        }
    }

    /**
     * Add or remove the Piper provider based on {@link Setting.PIPER_HTTP_URL}.
     */
    async updatePiperProvider(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            (p) => p.providerName !== 'piper',
        );

        const urlSetting = await this.settingsService.getSetting(Setting.PIPER_HTTP_URL);
        const baseUrl = urlSetting?.value?.trim();

        if (baseUrl) {
            const piperProvider = new PiperVoiceProvider(baseUrl, this.httpService);
            this.voiceProviders.push(piperProvider);
            this.cachedVoices = null;
            this.logger.log('Piper provider added', { baseUrl });
        } else {
            this.cachedVoices = null;
            this.logger.log('Piper provider not added — Piper HTTP URL not set');
        }
    }

    /**
     * Get the number of messages currently being rendered (pending audio generation)
     */
    getPendingMessagesCount(): number {
        return this.pendingMessages;
    }
}