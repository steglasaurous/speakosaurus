import { VoiceProvider } from "../voice-provider.interface";
import { HttpService } from "@nestjs/axios";
import { Voice } from "../voice.interface";
import { AudioData } from "../audio-data.interface";
import { firstValueFrom } from "rxjs";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";

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

interface TTSMonsterGenerateResponse {
    status: number;
    url: string;
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
                previewUrl: voice.sample || undefined,
            });
        }

        // Map custom voices
        for (const voice of response.data.customVoices) {
            voices.push({
                providerName: this.providerName,
                voiceId: voice.voice_id,
                voiceName: voice.name,
                displayName: voice.name,
                previewUrl: voice.sample || undefined,
            });
        }

        return voices;
    }

    async getVoiceById(id: string): Promise<Voice|null> {
        return null;
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        // Step 1: Generate TTS and get the audio URL
        const generateResponse = await firstValueFrom(
            this.httpService.post<TTSMonsterGenerateResponse>(
                this.generateTtsUrl,
                {
                    voice_id: voice.voiceId,
                    message: message,
                },
                {
                    headers: {
                        'Authorization': `${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            )
        );

        if (generateResponse.data.status !== 200 || !generateResponse.data.url) {
            throw new Error(`TTS Monster API returned error: status ${generateResponse.data.status}`);
        }

        // Step 2: Download the audio file from the URL
        const audioResponse = await firstValueFrom(
            this.httpService.get<ArrayBuffer>(
                generateResponse.data.url,
                {
                    responseType: 'arraybuffer',
                }
            )
        );

        // Step 3: Save to temporary file
        const audioBuffer = Buffer.from(audioResponse.data);
        const fileName = `${uuid()}.wav`;
        const tempFilePath = join(tmpdir(), fileName);
        writeFileSync(tempFilePath, audioBuffer);

        return {
            message,
            voice,
            audioFilePath: tempFilePath,
        };
    }
}