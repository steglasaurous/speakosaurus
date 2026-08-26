import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { VoiceProvider } from "../voice-provider.interface";
import { Voice } from "../voice.interface";
import { Injectable, Logger } from "@nestjs/common";
import { AudioData } from "../audio-data.interface";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";

@Injectable()
export class ElevenLabsVoiceProvider implements VoiceProvider {
  private logger = new Logger(ElevenLabsVoiceProvider.name);
    constructor(private readonly elevenLabsClient: ElevenLabsClient
    ) {}

    providerName = 'elevenlabs';

    async getVoices(): Promise<Voice[]> {

        const voices = await this.elevenLabsClient.voices.getAll();

        const output: Voice[] = [];
        for (const voice of voices.voices) {
            const voiceWithPreview = voice as typeof voice & { preview_url?: string };
            output.push({
                providerName: this.providerName,
                voiceId: voice.voiceId,
                voiceName: voice.name || 'unnamed_voice',
                displayName: voice.name || 'Unnamed Voice',
                previewUrl: voiceWithPreview.preview_url || undefined,
                language: voice.labels?.language || undefined,
                gender: voice.labels?.gender || undefined,
                description: voice.description || undefined,
                locale: voice.labels?.locale || undefined,
            });
        }

        return output;
    }

    // FUTURE: Might cache all the voices in memory or db and use that instead of calling the API each time
    async getVoiceById(id: string): Promise<Voice|null> {
        const voice = await this.elevenLabsClient.voices.get(id);
        const voiceWithPreview = voice as typeof voice & { preview_url?: string };
        return {
            providerName: this.providerName,
            voiceId: voice.voiceId,
            voiceName: voice.name || 'unnamed_voice',
            displayName: voice.name || 'Unnamed Voice',
            previewUrl: voiceWithPreview.preview_url || undefined,
            language: voice.labels?.language || undefined,
            gender: voice.labels?.gender || undefined,
            description: voice.description || undefined,
            locale: voice.labels?.locale || undefined,
        };
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        const tweaks = voice.tweaks;
        const convertOptions: {
            text: string;
            modelId: string;
            outputFormat: 'mp3_44100_128';
            voiceSettings?: {
                stability?: number;
                similarityBoost?: number;
                style?: number;
                useSpeakerBoost?: boolean;
                speed?: number;
            };
        } = {
            text: message,
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        };

        if (tweaks && this.hasElevenLabsTweaks(tweaks)) {
            convertOptions.voiceSettings = {
                stability: tweaks.elevenLabsStability,
                similarityBoost: tweaks.elevenLabsSimilarityBoost,
                style: tweaks.elevenLabsStyle,
                useSpeakerBoost: tweaks.elevenLabsUseSpeakerBoost,
                speed: tweaks.speed,
            };
        }

        const audioStream = await this.elevenLabsClient.textToSpeech.convert(voice.voiceId, convertOptions);

        // Collect ReadableStream data into a buffer
        const chunks: Buffer[] = [];
        const reader = audioStream.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(Buffer.from(value));
            }
        } finally {
            reader.releaseLock();
        }

        const audioBuffer = Buffer.concat(chunks);

        // Write buffer to temporary file
        const fileName = `${uuid()}.mp3`;
        const tempFilePath = join(tmpdir(), fileName);
        writeFileSync(tempFilePath, audioBuffer);

        return {
            message,
            voice,
            audioFilePath: tempFilePath,
        };
    }

    private hasElevenLabsTweaks(tweaks: NonNullable<Voice['tweaks']>): boolean {
        return (
            tweaks.speed != null ||
            tweaks.elevenLabsStability != null ||
            tweaks.elevenLabsSimilarityBoost != null ||
            tweaks.elevenLabsStyle != null ||
            tweaks.elevenLabsUseSpeakerBoost != null
        );
    }
}
