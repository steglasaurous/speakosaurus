import { AudioData } from '../audio-data.interface';
import { VoiceProvider } from '../voice-provider.interface';
import { Voice } from '../voice.interface';
import {
  AudioConfig,
  ResultReason,
  SpeechConfig,
  SpeechSynthesizer,
} from 'microsoft-cognitiveservices-speech-sdk';
import { v4 as uuid } from 'uuid';
import { join } from 'path';
import { tmpdir } from 'os';
import * as fs from 'fs';

export class AzureVoiceProvider implements VoiceProvider {
  providerName = 'azure';

  private speechConfig: SpeechConfig;

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
      voices.push({
        providerName: this.providerName,
        voiceId: voice.name,
        voiceName: voice.name,
        displayName: voice.name,
      });
    }

    // Clean up the synthesizer
    speechSynthesizer.close();

    return voices;
  }

  async getVoiceById(id: string): Promise<Voice | null> {
    return null;
  }

  async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
    const fileName = `${uuid()}.wav`;
    const tempFilePath = join(tmpdir(), fileName);

    const renderedSpeechConfig = this.speechConfig;
    renderedSpeechConfig.speechSynthesisVoiceName = voice.voiceId;
    const audioConfig = AudioConfig.fromAudioFileOutput(tempFilePath);

    const speechSynthesizer = new SpeechSynthesizer(
      renderedSpeechConfig,
      audioConfig,
    );
    return new Promise<AudioData>((resolve, reject) => {
      speechSynthesizer.speakTextAsync(message, (result) => {
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          speechSynthesizer.close();
          resolve({
            message,
            voice,
            audioFilePath: tempFilePath,
          });
        } else {
          reject(new Error(`Failed to synthesize audio: ${result.reason}`));
        }
      });
    });
  }
}
