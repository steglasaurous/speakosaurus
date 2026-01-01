import { Inject, Injectable } from "@nestjs/common";
import { VOICE_PROVIDERS } from "../../injection-tokens";
import { VoiceProvider } from "./voice-provider.interface";
import { Voice } from "./voice.interface";
import { AudioData } from "./audio-data.interface";
import { AudioProcessorService } from "../audio-processor.service";
import { SettingsService } from "../settings.service";

@Injectable()
export class VoiceProviderService {
    private cachedVoices: Voice[] | null = null;

    constructor(
        @Inject(VOICE_PROVIDERS) private readonly voiceProviders: VoiceProvider[],
        private readonly audioProcessorService: AudioProcessorService,
        private readonly settingsService: SettingsService
    ) {}

    async getVoices(forceReload = false): Promise<Voice[]> {
        // Return cached result if available and not forcing reload
        if (this.cachedVoices !== null && !forceReload) {
            return this.cachedVoices;
        }
        
        const output: Voice[] = [];
        for (const provider of this.voiceProviders) {
            const voices = await provider.getVoices();
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
        const provider = this.voiceProviders.find(p => p.providerName === providerName);
        
        if (!provider) {
            return null;
        }

        const voice = await provider.getVoiceById(voiceId);
        
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

        return await provider.getRenderedMessage(message, voice);
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
        const defaultVoiceSetting = await this.settingsService.getSetting(SettingsService.SETTING_DEFAULT_VOICE);
        if (!defaultVoiceSetting) {
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
}