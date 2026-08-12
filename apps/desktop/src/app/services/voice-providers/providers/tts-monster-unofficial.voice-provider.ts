import { HttpService } from '@nestjs/axios';
import { VoiceProvider } from '../voice-provider.interface';
import { Voice } from '../voice.interface';
import { AudioData } from '../audio-data.interface';
import { firstValueFrom } from 'rxjs';
import { Logger } from '@nestjs/common';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuid } from 'uuid';

export class TTSMonsterUnofficialVoiceProvider implements VoiceProvider {
  providerName = 'ttsMonsterUnofficial';

  private readonly getVoicesUrl = 'https://wutface.tts.monster/';
  private readonly generateTtsUrl =
    'https://us-central1-tts-monster.cloudfunctions.net/generateTTS';
  private readonly logger: Logger = new Logger(
    TTSMonsterUnofficialVoiceProvider.constructor.name,
  );

  constructor(
    private readonly userId: string,
    private readonly apiKey: string,
    private readonly httpService: HttpService,
  ) {}

  async getVoices(): Promise<Voice[]> {
    const response = await firstValueFrom(
      this.httpService.post<any>(
        this.getVoicesUrl,
        {
          userId: this.userId,
          apiKey: this.apiKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    if (response.status !== 200) {
      this.logger.warn(`Failed to get voices: ${response.statusText}`);
      return [];
    }
    console.log(response.data);

    const voices: Voice[] = [];
    // NOTE: The data we get back from this is VERY basic. There's no language, gender, or locale information.
    for (const voice of response.data.message.voices) {
      voices.push({
        providerName: this.providerName,
        voiceId: voice,
        voiceName: voice,
        displayName: voice,
      });
    }

    return voices;
  }

  async getVoiceById(id: string): Promise<Voice | null> {
    return null;
  }

  async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
    const requestBody = {
      data: {
        userId: this.userId,
        key: this.apiKey,
        ai: true,
        message: voice.voiceId + ': ' + message,
        details: {
          provider: 'Streamer.bot',
        },
      },
    };

    console.log(requestBody);

    const response = await firstValueFrom(
      this.httpService.post<any>(this.generateTtsUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    if (response.status !== 200) {
      this.logger.warn(`Failed to generate TTS: ${response.statusText}`);
      return null;
    }

    const audioResponse = await firstValueFrom(
      this.httpService.get<ArrayBuffer>(response.data.data.link, {
        responseType: 'arraybuffer',
      }),
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
