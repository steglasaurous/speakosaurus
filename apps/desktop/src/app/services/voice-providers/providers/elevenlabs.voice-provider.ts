import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { VoiceProvider } from "../voice-provider.interface";
import { Voice } from "../voice.interface";
import { Injectable } from "@nestjs/common";
import { AudioData } from "../audio-data.interface";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";

@Injectable()
export class ElevenLabsVoiceProvider implements VoiceProvider {
    constructor(private readonly elevenLabsClient: ElevenLabsClient
    ) {}

    providerName = 'elevenlabs';

    async getVoices(): Promise<Voice[]> {
        
        const voices = await this.elevenLabsClient.voices.getAll();
        
        const output: Voice[] = [];
        for (const voice of voices.voices) {
            output.push({
                providerName: this.providerName,
                voiceId: voice.voiceId,
                voiceName: voice.name,
                displayName: voice.name,
            });
        }

        return output;
    }

    // FUTURE: Might cache all the voices in memory or db and use that instead of calling the API each time
    async getVoiceById(id: string): Promise<Voice|null> {
        const voice = await this.elevenLabsClient.voices.get(id);
        return {
            providerName: this.providerName,
            voiceId: voice.voiceId,
            voiceName: voice.name,
            displayName: voice.name,
        };
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        const audioStream = await this.elevenLabsClient.textToSpeech.convert(voice.voiceId, {
            text: message,
            modelId: 'eleven_multilingual_v2',
            outputFormat: 'mp3_44100_128',
        });

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
}