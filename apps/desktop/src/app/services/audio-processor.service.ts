import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, unlinkSync } from 'fs';
import { extname } from 'path';
import { AudioData } from './voice-providers/audio-data.interface';
import { Setting, SettingsService } from './settings.service';
import { StatusEventService } from './status-event.service';
import { RenderTimingService } from './render-timing.service';
import App from '../app';

@Injectable()
export class AudioProcessorService {
    private logger: Logger = new Logger(AudioProcessorService.constructor.name);
    private queue: AudioData[] = [];

    private isProcessing = false;
    private isPaused = false;

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
      private readonly renderTimingService: RenderTimingService,
    ) {}

    getQueueSize(): number {
        return this.queue.length;
    }

    isPausedState(): boolean {
        return this.isPaused;
    }

    pause(): void {
        this.isPaused = true;
        this.statusEventService.emitStatusUpdate({
            audioQueueSize: this.queue.length,
        });
    }

    resume(): void {
        this.isPaused = false;
        if (!this.isProcessing && this.queue.length > 0) {
            void this.processQueue();
        }
        this.statusEventService.emitStatusUpdate({
            audioQueueSize: this.queue.length,
        });
    }

    /**
     * Stops currently playing audio and continues with the next queued item.
     */
    skipCurrent(): void {
        this.stopEpoch++;
        this.sendStopToRenderer();
        if (!this.isProcessing && this.queue.length > 0 && !this.isPaused) {
            void this.processQueue();
        }
        this.statusEventService.emitStatusUpdate({
            audioQueueSize: this.queue.length,
        });
    }

    clearQueue(): void {
        this.queue = [];
        this.statusEventService.emitStatusUpdate({ audioQueueSize: 0 });
    }

    async addToQueue(audioData: AudioData) {
        this.queue.push(audioData);
        this.statusEventService.emitStatusUpdate({
            audioQueueSize: this.queue.length,
        });
        if (!this.isProcessing && !this.isPaused) {
            this.logger.log('Processing queue', { queueLength: this.queue.length });
            this.processQueue();
        }
    }

    /**
     * Play already-rendered base64 audio on the local broadcaster speakers
     * without going through the file-based queue.
     */
    async playBase64Directly(payload: {
        base64: string;
        format: string;
        message: string;
        volume?: number;
        voice: {
            providerName: string;
            voiceId: string;
            voiceName: string;
            displayName: string;
        };
    }): Promise<void> {
        if (App.mainWindow && !App.mainWindow.isDestroyed()) {
            App.mainWindow.webContents.send('audio:play', payload);
        } else {
            this.logger.warn('Main window not available, cannot send audio to renderer');
        }
    }

    /**
     * Stops any currently playing audio in the renderer and clears the pending queue immediately.
     */
    stopAll(): { success: boolean; queueSize: number } {
        this.logger.log('Stopping all speech playback and clearing queue');

        this.stopEpoch++;
        this.processingRunId++;
        this.isProcessing = false;
        this.isPaused = false;

        this.queue = [];
        this.statusEventService.emitStatusUpdate({ audioQueueSize: 0 });
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
            if (this.isPaused) {
                break;
            }
            const audioData = this.queue.shift();
            if (audioData) {
                const stopEpochAtPlay = this.stopEpoch;
                this.logger.log('Playing audio data', { audioData });
                await this.playAudio(audioData, stopEpochAtPlay);
                this.statusEventService.emitStatusUpdate({
                    audioQueueSize: this.queue.length,
                });

                this.logger.log(`Pausing between messages for ${pauseBetweenMessages}ms`);
                await this.sleepInterruptible(pauseBetweenMessages, runId);
            }
        }

        this.isProcessing = false;
        this.logger.log('Queue processed', { queueLength: this.queue.length });
    }

    private async sleepInterruptible(ms: number, runId: number): Promise<void> {
        const start = Date.now();
        const stepMs = 50;

        while (Date.now() - start < ms) {
            if (runId !== this.processingRunId) return;
            await new Promise(resolve => setTimeout(resolve, Math.min(stepMs, ms - (Date.now() - start))));
        }
    }

    private async playAudio(audioData: AudioData, stopEpochAtPlay: number): Promise<void> {
        try {
            const transferStarted = audioData.timingId ? Date.now() : 0;
            const audioBuffer = readFileSync(audioData.audioFilePath);
            const base64 = audioBuffer.toString('base64');
            const format = extname(audioData.audioFilePath).slice(1).toLowerCase();

            if (stopEpochAtPlay !== this.stopEpoch) {
                this.logger.log('Suppressing audio:play due to stop epoch change', {
                    stopEpochAtPlay,
                    stopEpochNow: this.stopEpoch,
                });
                return;
            }

            if (App.mainWindow && !App.mainWindow.isDestroyed()) {
                App.mainWindow.webContents.send('audio:play', {
                    base64,
                    format,
                    message: audioData.message,
                    volume: audioData.volume ?? 1,
                    timingId: audioData.timingId,
                    voice: {
                        providerName: audioData.voice.providerName,
                        voiceId: audioData.voice.voiceId,
                        voiceName: audioData.voice.voiceName,
                        displayName: audioData.voice.displayName,
                    },
                });
                this.logger.log('Sent audio data to renderer', { format, message: audioData.message });
                if (audioData.timingId) {
                    this.renderTimingService.log({
                        id: audioData.timingId,
                        stage: 'transfer',
                        audioBytes: audioBuffer.length,
                        ms: Date.now() - transferStarted,
                    });
                }
            } else {
                this.logger.warn('Main window not available, cannot send audio to renderer');
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            this.logger.error('Error processing audio for renderer', err);
            throw err;
        } finally {
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
