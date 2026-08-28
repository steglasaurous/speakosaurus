import { Logger } from "@nestjs/common";
import { VoiceProvider } from "../voice-provider.interface";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Voice } from "../voice.interface";
import { AudioData } from "../audio-data.interface";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
import { PiperVoiceCatalogService } from "../../piper-voice-catalog.service";

/** Piper HTTP server `GET /voices` body: voice id -> model metadata (see piper voice JSON). */
type PiperVoicesResponse = Record<
    string,
    {
        audio?: { quality?: string; sample_rate?: number };
        dataset?: string;
        language?: {
            code?: string;
            country_english?: string;
            family?: string;
            name_english?: string;
            region?: string;
        };
    }
>;

/**
 * Piper voice provider - this uses piper's http server to get voices and render output.
 *
 */
export class PiperVoiceProvider implements VoiceProvider {
    providerName = 'piper';
    private logger: Logger = new Logger(PiperVoiceProvider.constructor.name);

    constructor(
        private readonly piperUrl = 'http://localhost:5000',
        private readonly httpService: HttpService,
        private readonly catalogService?: PiperVoiceCatalogService,
    ) {}

    async getVoices(): Promise<Voice[]> {
        let local: Voice[] = [];
        try {
            local = await this.fetchLocalVoices();
        } catch (error) {
            this.logger.warn(
                'Failed to list Piper HTTP voices; showing catalog only',
                error,
            );
        }

        if (!this.catalogService) {
            return local;
        }
        return this.catalogService.merge(local);
    }

    private async fetchLocalVoices(): Promise<Voice[]> {
        const response = await firstValueFrom(
            this.httpService.get<PiperVoicesResponse>(`${this.piperUrl}/voices`),
        );

        const data = response.data ?? {};
        const voices: Voice[] = [];

        for (const [voiceId, config] of Object.entries(data)) {
            const lang = config.language;
            const parts: string[] = [];
            if (lang?.name_english) {
                parts.push(
                    lang.country_english
                        ? `${lang.name_english} (${lang.country_english})`
                        : lang.name_english,
                );
            } else if (lang?.code) {
                parts.push(lang.code);
            }
            if (config.dataset) {
                parts.push(config.dataset);
            }
            if (config.audio?.quality) {
                parts.push(config.audio.quality);
            }
            const displayName = parts.length > 0 ? parts.join(" — ") : voiceId;

            voices.push({
                providerName: this.providerName,
                voiceId,
                voiceName: voiceId,
                displayName,
                group: lang?.code ?? lang?.family,
                language: config.language?.family || undefined,
                locale: config.language?.code?.replace('_', '-') || undefined,
            });
        }

        voices.sort((a, b) =>
            (a.displayName ?? a.voiceId).localeCompare(b.displayName ?? b.voiceId),
        );
        return voices;
    }

    async getVoiceById(id: string): Promise<Voice | null> {
        const voices = await this.getVoices();
        return voices.find((v) => v.voiceId === id) ?? null;
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        const body: {
            text: string;
            voice: string;
            length_scale?: number;
            noise_scale?: number;
        } = { text: message, voice: voice.voiceId };

        const speed = voice.tweaks?.speed;
        if (speed != null && speed > 0 && speed !== 1) {
            body.length_scale = 1 / speed;
        }
        if (voice.tweaks?.piperNoiseScale != null) {
            body.noise_scale = voice.tweaks.piperNoiseScale;
        }

        const ttsResponse = await firstValueFrom(
            this.httpService.post<ArrayBuffer>(
                `${this.piperUrl.replace(/\/$/, "")}/synthesize`,
                body,
                {
                    headers: { "Content-Type": "application/json" },
                    responseType: "arraybuffer",
                },
            ),
        );

        const audioBuffer = Buffer.from(ttsResponse.data);
        if (!audioBuffer.length) {
            throw new Error("Piper HTTP server returned empty audio");
        }

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
