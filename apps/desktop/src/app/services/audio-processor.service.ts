import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, unlinkSync } from 'fs';
import { extname } from 'path';
import { AudioData } from './voice-providers/audio-data.interface';
import { Setting, SettingsService } from './settings.service';
import { StatusEventService } from './status-event.service';
import App from '../app';

@Injectable()
export class AudioProcessorService {
    private logger: Logger = new Logger(AudioProcessorService.constructor.name);
    private queue: AudioData[] = [];

    private isProcessing = false;
    constructor(
      private readonly settingsService: SettingsService,
      private readonly statusEventService: StatusEventService,
    ) {}

    getQueueSize(): number {
        return this.queue.length;
    }

    async addToQueue(audioData: AudioData) {
        this.queue.push(audioData);
        // Emit status update
        this.statusEventService.emitStatusUpdate({ 
            audioQueueSize: this.queue.length 
        });
        if (!this.isProcessing) {   
            this.logger.log('Processing queue', { queueLength: this.queue.length });
            this.processQueue();
        }
    }

    private async processQueue() {
        this.isProcessing = true;
        let pauseBetweenMessages = 1000;
        const pauseBetweenMessagesSetting = await this.settingsService.getSetting(Setting.PAUSE_BETWEEN_MESSAGES_MS);
        if (pauseBetweenMessagesSetting) {
            pauseBetweenMessages = parseInt(pauseBetweenMessagesSetting.value ?? '1000');
        }

        while (this.queue.length > 0) {
            const audioData = this.queue.shift();
            if (audioData) {
                this.logger.log('Playing audio data', { audioData });
                await this.playAudio(audioData);
                // Emit update after playing audio
                this.statusEventService.emitStatusUpdate({ 
                    audioQueueSize: this.queue.length 
                });
                
                this.logger.log(`Pausing between messages for ${pauseBetweenMessages}ms`);
                await new Promise(resolve => setTimeout(resolve, pauseBetweenMessages));
            }
        }

        this.isProcessing = false;
        this.logger.log('Queue processed', { queueLength: this.queue.length });
    }

    private async playAudio(audioData: AudioData): Promise<void> {
        try {
            // Read audio file and convert to base64
            const audioBuffer = readFileSync(audioData.audioFilePath);
            const base64 = audioBuffer.toString('base64');
            
            // Determine audio format from file extension
            const format = extname(audioData.audioFilePath).slice(1).toLowerCase(); // Remove leading dot
            
            // Send audio data to renderer process via IPC
            if (App.mainWindow && !App.mainWindow.isDestroyed()) {
                App.mainWindow.webContents.send('audio:play', {
                    base64,
                    format,
                    message: audioData.message,
                    voice: {
                        providerName: audioData.voice.providerName,
                        voiceId: audioData.voice.voiceId,
                        voiceName: audioData.voice.voiceName,
                        displayName: audioData.voice.displayName,
                    },
                });
                this.logger.log('Sent audio data to renderer', { format, message: audioData.message });
            } else {
                this.logger.warn('Main window not available, cannot send audio to renderer');
            }
            
            // Wait a bit for the audio to be sent before deleting the file
            // The renderer will handle playback, but we give it a moment to receive the data
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            this.logger.error('Error processing audio for renderer', err);
            throw err;
        } finally {
            // Delete the temporary file after sending to renderer
            try {
                unlinkSync(audioData.audioFilePath);
            } catch (deleteError) {
                this.logger.error(`Failed to delete temp file ${audioData.audioFilePath}:`, deleteError);
            }
        }
    }
}