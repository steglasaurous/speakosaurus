import { AudioData } from '../audio-data.interface';
import { VoiceProvider } from '../voice-provider.interface';
import { Voice } from '../voice.interface';
import {
  ResultReason,
  SpeechConfig,
  SpeechSynthesizer,
  SpeechSynthesisOutputFormat,
  SynthesisVoiceGender,
} from 'microsoft-cognitiveservices-speech-sdk';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';
import { Logger } from '@nestjs/common';

export class AzureVoiceProvider implements VoiceProvider {
  providerName = 'azure';

  private speechConfig: SpeechConfig;
  private logger: Logger = new Logger(AzureVoiceProvider.constructor.name);

  constructor(
    private readonly apiKey: string,
    private readonly region: string,
    private readonly endpoint: string,
  ) {
    this.speechConfig = SpeechConfig.fromEndpoint(
      new URL(this.endpoint),
      this.apiKey,
    );
  }

  async getVoices(): Promise<Voice[]> {
    // Use fromSubscription for getVoicesAsync as it works more reliably than fromEndpoint
    const voicesConfig = SpeechConfig.fromSubscription(
      this.apiKey,
      this.region,
    );
    const speechSynthesizer = new SpeechSynthesizer(voicesConfig);
    const result = await speechSynthesizer.getVoicesAsync();
    const voices: Voice[] = [];
    for (const voice of result.voices) {
      const sdkVoice = voice as typeof voice & { styleList?: string[]; StyleList?: string[] };
      const supportedStyles = (sdkVoice.styleList ?? sdkVoice.StyleList ?? []).filter(Boolean);
      const newVoice: Voice = {
        providerName: this.providerName,
        voiceId: voice.name,
        voiceName: voice.name,
        displayName: voice.name,
        locale: voice.locale,
        gender: voice.gender === SynthesisVoiceGender.Male ? 'male' : voice.gender === SynthesisVoiceGender.Female ? 'female' : 'other',
        language: voice.locale?.split('-')[0],
        supportedStyles: supportedStyles.length ? supportedStyles : undefined,
      };
      voices.push(newVoice);
    }

    // Clean up the synthesizer
    speechSynthesizer.close();

    return voices;
  }

  async getVoiceById(_id: string): Promise<Voice | null> {
    return null;
  }

  async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
    const fileName = `${uuid()}.wav`;
    const tempFilePath = join(tmpdir(), fileName);
    const renderedSpeechConfig = this.speechConfig;
    renderedSpeechConfig.speechSynthesisVoiceName = voice.voiceId;
    renderedSpeechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Riff48Khz16BitMonoPcm;
    const audioConfig = null;

    const speechSynthesizer = new SpeechSynthesizer(
      renderedSpeechConfig,
      audioConfig,
    );

    const useSsml = this.needsSsml(voice);

    return new Promise<AudioData>((resolve, reject) => {
      const onResult = (result: { reason: ResultReason; audioData: ArrayBuffer }) => {
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          try {
            const audioData = result.audioData;
            if (!audioData || audioData.byteLength === 0) {
              speechSynthesizer.close();
              reject(new Error('No audio data received from Azure Speech SDK'));
              return;
            }

            const buffer = Buffer.from(audioData);
            writeFileSync(tempFilePath, buffer);

            this.logger.log('Audio file written successfully', {
              filePath: tempFilePath,
              size: buffer.length
            });

            speechSynthesizer.close();
            resolve({
              message,
              voice,
              audioFilePath: tempFilePath,
            });
          } catch (error) {
            speechSynthesizer.close();
            this.logger.error('Error writing audio file', error);
            reject(new Error(`Failed to write audio file: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        } else {
          speechSynthesizer.close();
          reject(new Error(`Failed to synthesize audio: ${result.reason}`));
        }
      };

      if (useSsml) {
        speechSynthesizer.speakSsmlAsync(this.buildSsml(message, voice), onResult);
      } else {
        speechSynthesizer.speakTextAsync(message, onResult);
      }
    });
  }

  private needsSsml(voice: Voice): boolean {
    const tweaks = voice.tweaks;
    if (!tweaks) {
      return false;
    }
    return (
      (tweaks.speed != null && tweaks.speed !== 1) ||
      (tweaks.pitch != null && tweaks.pitch !== 1) ||
      !!tweaks.azureStyle
    );
  }

  private buildSsml(message: string, voice: Voice): string {
    const tweaks = voice.tweaks ?? {};
    const rate = tweaks.speed ?? 1;
    const pitch = tweaks.pitch ?? 1;
    const lang = this.escapeXml(voice.locale || 'en-US');
    let inner = this.escapeXml(message);

    const prosodyAttrs: string[] = [];
    if (rate !== 1) {
      prosodyAttrs.push(`rate="${rate}"`);
    }
    if (pitch !== 1) {
      const percent = ((pitch - 1) * 100).toFixed(2);
      const signed = Number(percent) >= 0 ? `+${percent}` : percent;
      prosodyAttrs.push(`pitch="${signed}%"`);
    }
    if (prosodyAttrs.length) {
      inner = `<prosody ${prosodyAttrs.join(' ')}>${inner}</prosody>`;
    }

    if (tweaks.azureStyle) {
      const style = this.escapeXml(tweaks.azureStyle);
      const degree = tweaks.azureStyleDegree ?? 1;
      inner = `<mstts:express-as style="${style}" styledegree="${degree}">${inner}</mstts:express-as>`;
    }

    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${this.escapeXml(voice.voiceId)}">${inner}</voice></speak>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
