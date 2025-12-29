import { Inject, Injectable } from "@nestjs/common";
import { VOICE_PROVIDERS } from "../../injection-tokens";
import { VoiceProvider } from "./voice-provider.interface";
import { Voice } from "./voice.interface";

@Injectable()
export class VoiceProviderService {
    constructor(@Inject(VOICE_PROVIDERS) private readonly voiceProviders: VoiceProvider[]) {

    }

    async getVoices(): Promise<Voice[]> {
        
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

        return output;
    }
}