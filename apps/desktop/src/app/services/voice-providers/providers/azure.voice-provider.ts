import { AudioData } from '../audio-data.interface';
import { VoiceProvider } from '../voice-provider.interface';
import { Voice } from '../voice.interface';
import {
  ResultReason,
  SpeechConfig,
  SpeechSynthesizer,
  SpeechSynthesisOutputFormat,
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

  async getVoiceById(_id: string): Promise<Voice | null> {
    return null;
  }

  async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
    const fileName = `${uuid()}.wav`;
    const tempFilePath = join(tmpdir(), fileName);
    const renderedSpeechConfig = this.speechConfig;
    renderedSpeechConfig.speechSynthesisVoiceName = voice.voiceId;
    // Set output format to standard RIFF WAV format compatible with Web Audio API
    renderedSpeechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Riff48Khz16BitMonoPcm;
    // Use null for AudioConfig to get audioData directly from result instead of writing to file
    const audioConfig = null;

    const speechSynthesizer = new SpeechSynthesizer(
      renderedSpeechConfig,
      audioConfig,
    );
    return new Promise<AudioData>((resolve, reject) => {
      speechSynthesizer.speakTextAsync(message, (result) => {
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          try {
            // Get audioData directly from result and write to file ourselves
            // This ensures we have full control over the file writing process
            const audioData = result.audioData;
            if (!audioData || audioData.byteLength === 0) {
              speechSynthesizer.close();
              reject(new Error('No audio data received from Azure Speech SDK'));
              return;
            }
            
            // Convert ArrayBuffer to Node.js Buffer and write to file
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
      });
    });
  }
}
