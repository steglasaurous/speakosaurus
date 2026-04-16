import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { SettingsService } from './settings.service';

export interface AudioPlayData {
  base64: string;
  format: string;
  message: string;
  voice: {
    providerName: string;
    voiceId: string;
    voiceName: string;
    displayName: string;
  };
}

declare global {
  interface Window {
    AppBridge?: {
      onAudioPlay: (callback: (data: AudioPlayData) => void) => void;
      removeAudioPlayListener: () => void;
      onAudioStop: (callback: () => void) => void;
      removeAudioStopListener: () => void;
    };
  }
}

@Injectable({
  providedIn: 'root',
})
export class AudioService implements OnDestroy {
  private audioContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | HTMLAudioElement | null = null;
  private isPlaying = false;
  private audioQueue: AudioPlayData[] = [];
  private pauseBetweenMessages = 1000;
  private audioPlayListener: ((data: AudioPlayData) => void) | null = null;
  private audioStopListener: (() => void) | null = null;
  private ngZone = inject(NgZone);
  private settingsService = inject(SettingsService);
  constructor() {
    this.initializeAudioContext();
    this.setupIpcListener();
    this.loadSettings();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  private initializeAudioContext(): void {
    try {
      // Create AudioContext for Web Audio API
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
    }
  }

  private setupIpcListener(): void {
    if (typeof window !== 'undefined' && window.AppBridge) {
      this.audioPlayListener = (data: AudioPlayData) => {
        this.ngZone.run(() => {
          this.playAudio(data);
        });
      };
      window.AppBridge.onAudioPlay(this.audioPlayListener);

      this.audioStopListener = () => {
        this.ngZone.run(() => {
          this.stopAllPlayback();
        });
      };
      window.AppBridge.onAudioStop(this.audioStopListener);
    } else {
      console.warn('AppBridge not available, audio playback will not work');
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      // Load pause between messages setting
      // Note: The actual setting name needs to match what's in the backend
      // For now, we'll use a default and could subscribe to setting changes later
      this.settingsService.getSetting('pauseBetweenMessagesMs').subscribe({
        next: (setting) => {
          if (setting?.value) {
            this.pauseBetweenMessages = parseInt(setting.value, 10) || 1000;
          }
        },
        error: (error) => {
          console.error('Failed to load pause between messages setting:', error);
        },
      });
    } catch (error) {
      console.error('Failed to load audio settings:', error);
    }
  }

  private async playAudio(data: AudioPlayData): Promise<void> {
    // Add to queue
    this.audioQueue.push(data);

    // If already playing, the queue will be processed when current audio finishes
    if (this.isPlaying) {
      return;
    }

    // Start processing queue
    this.processQueue();
  }

  /**
   * Stops currently playing audio and clears any queued audio immediately.
   * Called when the backend triggers an IPC `audio:stop`.
   */
  private stopAllPlayback(): void {
    // Clear pending queue and stop any future processing.
    this.audioQueue = [];
    this.isPlaying = false;

    if (!this.currentAudioSource) return;

    // Stop whatever is currently playing.
    if (this.currentAudioSource instanceof AudioBufferSourceNode) {
      try {
        this.currentAudioSource.stop();
      } catch {
        // Source may have already ended.
      }
    } else if (this.currentAudioSource instanceof HTMLAudioElement) {
      try {
        this.currentAudioSource.pause();
        this.currentAudioSource.currentTime = 0;
        // Resolve the awaiting promise in `playWithHTML5Audio` by manually firing `ended`.
        this.currentAudioSource.dispatchEvent(new Event('ended'));
      } catch {
        // Ignore stop errors.
      }
    }

    this.currentAudioSource = null;
  }

  private async processQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.audioQueue.shift();

    if (!audioData) {
      this.isPlaying = false;
      return;
    }

    try {
      // Convert base64 to ArrayBuffer
      const binaryString = atob(audioData.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      // Try Web Audio API first (works for WAV and often MP3/M4A)
      if (this.audioContext && this.canUseWebAudioAPI(audioData.format)) {
        try {
          await this.playWithWebAudioAPI(arrayBuffer);
        } catch (error) {
          console.warn('Web Audio API failed, falling back to HTML5 Audio:', error);
          await this.playWithHTML5Audio(arrayBuffer, audioData.format);
        }
      } else {
        // Fallback to HTML5 Audio
        await this.playWithHTML5Audio(arrayBuffer, audioData.format);
      }

      // Note: Pause between messages is handled by the main process
      // We just play the audio and move to the next item in queue
    } catch (error) {
      console.error('Error playing audio:', error);
    } finally {
      // Process next item in queue
      this.processQueue();
    }
  }

  private canUseWebAudioAPI(format: string): boolean {
    // Web Audio API can decode WAV natively
    // Modern browsers can also decode MP3 and M4A, but it's not guaranteed
    const supportedFormats = ['wav', 'mp3', 'm4a', 'ogg'];
    return supportedFormats.includes(format.toLowerCase());
  }

  private getMimeType(format: string): string {
    const formatLower = format.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'wav': 'audio/wav',
      'wave': 'audio/wav',
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'ogg': 'audio/ogg',
      'opus': 'audio/ogg; codecs=opus',
    };
    return mimeTypes[formatLower] || `audio/${format}`;
  }

  private async playWithWebAudioAPI(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    // Resume AudioContext if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Decode audio data (this will throw if decoding fails)
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
      throw new Error(`Failed to decode audio data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create buffer source
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    this.currentAudioSource = source;

    // Play audio
    return new Promise((resolve, reject) => {
      try {
        source.onended = () => {
          this.currentAudioSource = null;
          resolve();
        };
        source.start(0);
      } catch (error) {
        this.currentAudioSource = null;
        reject(error instanceof Error ? error : new Error('Failed to start audio playback'));
      }
    });
  }

  private playWithHTML5Audio(arrayBuffer: ArrayBuffer, format: string): Promise<void> {
    // Create blob URL from array buffer with proper MIME type
    const mimeType = this.getMimeType(format);
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Create audio element
    const audio = new Audio(url);
    this.currentAudioSource = audio;

    // Play audio
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudioSource = null;
        resolve();
      };
      audio.onerror = (error) => {
        URL.revokeObjectURL(url);
        this.currentAudioSource = null;
        reject(error);
      };
      audio.play().catch(reject);
    });
  }

  private cleanup(): void {
    // Stop current playback
    if (this.currentAudioSource) {
      if (this.currentAudioSource instanceof AudioBufferSourceNode) {
        try {
          this.currentAudioSource.stop();
        } catch (error) {
          // Source may have already ended
        }
      } else if (this.currentAudioSource instanceof HTMLAudioElement) {
        this.currentAudioSource.pause();
        this.currentAudioSource.src = '';
      }
      this.currentAudioSource = null;
    }

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(console.error);
    }

    // Remove IPC listener
    if (typeof window !== 'undefined' && window.AppBridge && this.audioPlayListener) {
      window.AppBridge.removeAudioPlayListener();
    }

    if (typeof window !== 'undefined' && window.AppBridge && this.audioStopListener) {
      window.AppBridge.removeAudioStopListener();
    }
  }
}
