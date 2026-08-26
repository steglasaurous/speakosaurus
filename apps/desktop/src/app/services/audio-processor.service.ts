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

    /**
     * Monotonically increasing value that is bumped whenever the user hits "Stop".
     * Used to discard late render/download results that complete after Stop.
     */
    private stopEpoch = 0;
    /**
     * Monotonically increasing run identifier used to cancel an in-flight `processQueue()` loop.
     * When `processingRunId` changes, the loop exits as soon as possible.
     */
    private processingRunId = 0;
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

    /**
     * Stops any currently playing audio in the renderer and clears the pending queue immediately.
     */
    stopAll(): { success: boolean; queueSize: number } {
        this.logger.log('Stopping all speech playback and clearing queue');

        // Cancel the currently running processing loop, if any.
        this.stopEpoch++;
        this.processingRunId++;
        this.isProcessing = false;

        // Clear pending items.
        this.queue = [];
        this.statusEventService.emitStatusUpdate({ audioQueueSize: 0 });

        // Tell the renderer to stop the currently playing audio.
        this.sendStopToRenderer();

        return { success: true, queueSize: 0 };
    }

    getStopEpoch(): number {
        return this.stopEpoch;
    }

    private async processQueue() {
        const runId = ++this.processingRunId;
        this.isProcessing = true;
        let pauseBetweenMessages = 1000;
        const pauseBetweenMessagesSetting = await this.settingsService.getSetting(Setting.PAUSE_BETWEEN_MESSAGES_MS);
        if (pauseBetweenMessagesSetting) {
            pauseBetweenMessages = parseInt(pauseBetweenMessagesSetting.value ?? '1000');
        }

        while (this.queue.length > 0 && runId === this.processingRunId) {
            const audioData = this.queue.shift();
            if (audioData) {
                // Capture epoch at the moment we decide to play this item.
                const stopEpochAtPlay = this.stopEpoch;
                this.logger.log('Playing audio data', { audioData });
                await this.playAudio(audioData, stopEpochAtPlay);
                // Emit update after playing audio
                this.statusEventService.emitStatusUpdate({ 
                    audioQueueSize: this.queue.length 
                });
                
                this.logger.log(`Pausing between messages for ${pauseBetweenMessages}ms`);
                await this.sleepInterruptible(pauseBetweenMessages, runId);
            }
        }

        this.isProcessing = false;
        this.logger.log('Queue processed', { queueLength: this.queue.length });
    }

    private async sleepInterruptible(ms: number, runId: number): Promise<void> {
        // Wake periodically so we can exit quickly on `stopAll()`.
        const start = Date.now();
        const stepMs = 50;

        while (Date.now() - start < ms) {
            if (runId !== this.processingRunId) return;
            await new Promise(resolve => setTimeout(resolve, Math.min(stepMs, ms - (Date.now() - start))));
        }
    }

    private async playAudio(audioData: AudioData, stopEpochAtPlay: number): Promise<void> {
        try {
            // Read audio file and convert to base64
            const audioBuffer = readFileSync(audioData.audioFilePath);
            const base64 = audioBuffer.toString('base64');
            
            // Determine audio format from file extension
            const format = extname(audioData.audioFilePath).slice(1).toLowerCase(); // Remove leading dot

            // If Stop was requested after we captured `stopEpochAtPlay`, suppress playback.
            // (Prevents `audio:play` from being sent just as the user hits Stop.)
            if (stopEpochAtPlay !== this.stopEpoch) {
                this.logger.log('Suppressing audio:play due to stop epoch change', {
                    stopEpochAtPlay,
                    stopEpochNow: this.stopEpoch,
                });
                return;
            }
            
            // Send audio data to renderer process via IPC
            if (App.mainWindow && !App.mainWindow.isDestroyed()) {
                App.mainWindow.webContents.send('audio:play', {
                    base64,
                    format,
                    message: audioData.message,
                    volume: audioData.volume ?? 1,
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

    private sendStopToRenderer(): void {
        if (App.mainWindow && !App.mainWindow.isDestroyed()) {
            App.mainWindow.webContents.send('audio:stop');
        } else {
            this.logger.warn('Main window not available, cannot send audio stop IPC');
        }
    }
}