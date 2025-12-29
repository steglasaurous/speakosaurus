import { Inject, Injectable } from "@nestjs/common";
import { VOICE_PROVIDERS } from "../../injection-tokens";
import { VoiceProvider } from "./voice-provider.interface";
import { Voice } from "./voice.interface";
import { AudioData } from "./audio-data.interface";
import { AudioProcessorService } from "../audio-processor.service";

@Injectable()
export class VoiceProviderService {
    private cachedVoices: Voice[] | null = null;

    constructor(
        @Inject(VOICE_PROVIDERS) private readonly voiceProviders: VoiceProvider[],
        private readonly audioProcessorService: AudioProcessorService
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
}