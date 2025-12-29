import { Injectable } from '@nestjs/common';
import player from 'play-sound';
import { unlinkSync } from 'fs';
import { AudioData } from './voice-providers/audio-data.interface';

@Injectable()
export class AudioProcessorService {
    private queue: AudioData[] = [];
    private audioPlayer = player();

    // in ms
    private pauseBetweenMessages = 2000;

    private isProcessing = false;

    async addToQueue(audioData: AudioData) {
        this.queue.push(audioData);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    private async processQueue() {
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const audioData = this.queue.shift();
            if (audioData) {
                await this.playAudio(audioData);
                await new Promise(resolve => setTimeout(resolve, this.pauseBetweenMessages));
            }
        }
        this.isProcessing = false;
    }

    private async playAudio(audioData: AudioData): Promise<void> {
        return new Promise((resolve, reject) => {
            this.audioPlayer.play(audioData.audioFilePath, (err) => {
                // Delete the temporary file after playback
                try {
                    unlinkSync(audioData.audioFilePath);
                } catch (deleteError) {
                    console.error(`Failed to delete temp file ${audioData.audioFilePath}:`, deleteError);
                }

                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}