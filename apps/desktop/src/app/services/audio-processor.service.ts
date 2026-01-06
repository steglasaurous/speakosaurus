import { Injectable, Logger } from '@nestjs/common';
import sound from 'sound-play';
import { unlinkSync } from 'fs';
import { AudioData } from './voice-providers/audio-data.interface';
import { Setting, SettingsService } from './settings.service';

@Injectable()
export class AudioProcessorService {
    private logger: Logger = new Logger(AudioProcessorService.constructor.name);
    private queue: AudioData[] = [];

    private isProcessing = false;
    constructor(private readonly settingsService: SettingsService) {}

    async addToQueue(audioData: AudioData) {
        this.queue.push(audioData);
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
                this.logger.log(`Pausing between messages for ${pauseBetweenMessages}ms`);
                await new Promise(resolve => setTimeout(resolve, pauseBetweenMessages));
            }
        }
        this.isProcessing = false;
        this.logger.log('Queue processed', { queueLength: this.queue.length });
    }

    private async playAudio(audioData: AudioData): Promise<void> {
        try {
            await sound.play(audioData.audioFilePath);
        } catch (err) {
            this.logger.error('Error playing audio', err);
            throw err;
        } finally {
            // Delete the temporary file after playback
            try {
                unlinkSync(audioData.audioFilePath);
            } catch (deleteError) {
                this.logger.error(`Failed to delete temp file ${audioData.audioFilePath}:`, deleteError);
            }
        }
    }
}