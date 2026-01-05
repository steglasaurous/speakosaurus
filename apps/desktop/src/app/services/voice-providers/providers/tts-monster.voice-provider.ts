import { SettingsService, Setting } from "../../settings.service";
import { VoiceProvider } from "../voice-provider.interface";
import { HttpService } from "@nestjs/axios";
import { Voice } from "../voice.interface";
import { AudioData } from "../audio-data.interface";
import { firstValueFrom } from "rxjs";

interface TTSMonsterVoiceResponse {
    voices: Array<{
        voice_id: string;
        name: string;
        sample: string;
        metadata?: string;
    }>;
    customVoices: Array<{
        voice_id: string;
        name: string;
        sample: string;
        language?: string;
    }>;
}

export class TTSMonsterVoiceProvider implements VoiceProvider {
private readonly generateTtsUrl = 'https://api.console.tts.monster/generate';
private readonly getVoicesUrl = 'https://api.console.tts.monster/voices';

constructor(private readonly apiKey: string, private readonly httpService: HttpService) {}

    providerName = 'ttsMonster';

    async getVoices(): Promise<Voice[]> {
        const response = await firstValueFrom(
            this.httpService.post<TTSMonsterVoiceResponse>(
                this.getVoicesUrl,
                {},
                {
                    headers: {
                        'Authorization': `${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            )
        );

        const voices: Voice[] = [];

        // Map regular voices
        for (const voice of response.data.voices) {
            voices.push({
                providerName: this.providerName,
                voiceId: voice.voice_id,
                voiceName: voice.name,
                displayName: voice.name,
            });
        }

        // Map custom voices
        for (const voice of response.data.customVoices) {
            voices.push({
                providerName: this.providerName,
                voiceId: voice.voice_id,
                voiceName: voice.name,
                displayName: voice.name,
            });
        }

        return voices;
    }

    async getVoiceById(id: string): Promise<Voice|null> {
        return null;
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        return null;
    }
}