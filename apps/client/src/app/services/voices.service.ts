import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_URL } from '../constants';

export interface VoiceTweakSettings {
  speed?: number;
  pitch?: number;
  volume?: number;
  azureStyle?: string;
  azureStyleDegree?: number;
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsUseSpeakerBoost?: boolean;
  piperNoiseScale?: number;
}

export const DEFAULT_VOICE_TWEAKS: VoiceTweakSettings = {
  speed: 1,
  pitch: 1,
  volume: 1,
  azureStyle: '',
  azureStyleDegree: 1,
  elevenLabsStability: 0.5,
  elevenLabsSimilarityBoost: 0.75,
  elevenLabsStyle: 0,
  elevenLabsUseSpeakerBoost: true,
  piperNoiseScale: 0.667,
};

export interface Voice {
  voiceId: string;
  providerName: string;
  voiceName: string;
  displayName?: string;
  group?: string;
  previewUrl?: string;
  /** 2-character language code (e.g. en) */
  language?: string;
  /** male, female, other */
  gender?: string;
  description?: string;
  /** ISO locale (e.g. en-US, es-ES) */
  locale?: string;
  supportedStyles?: string[];
  isCustom?: boolean;
  baseVoiceId?: string;
  tweaks?: VoiceTweakSettings;
}

@Injectable({
  providedIn: 'root',
})
export class VoicesService {
  private apiUrl = API_URL;
  private http = inject(HttpClient);

  getVoices(forceReload = false): Observable<Voice[]> {
    let params = new HttpParams();
    if (forceReload) {
      params = params.set('forceReload', 'true');
    }
    return this.http.get<Voice[]>(`${this.apiUrl}/voices`, { params });
  }

  searchVoices(query: string): Observable<Voice[]> {
    return this.getVoices().pipe(
      map(voices => {
        if (!query || query.trim() === '') {
          return voices;
        }
        const lowerQuery = query.toLowerCase();
        return voices.filter(voice =>
          voice.voiceName.toLowerCase().includes(lowerQuery) ||
          voice.providerName.toLowerCase().includes(lowerQuery) ||
          (voice.displayName && voice.displayName.toLowerCase().includes(lowerQuery)) ||
          (voice.language && voice.language.toLowerCase().includes(lowerQuery)) ||
          (voice.locale && voice.locale.toLowerCase().includes(lowerQuery)) ||
          (voice.gender && voice.gender.toLowerCase().includes(lowerQuery)) ||
          (voice.description && voice.description.toLowerCase().includes(lowerQuery))
        );
      }),
      map(voices => {
        // Group by provider and sort alphabetically
        const grouped = voices.reduce((acc, voice) => {
          if (!acc[voice.providerName]) {
            acc[voice.providerName] = [];
          }
          acc[voice.providerName].push(voice);
          return acc;
        }, {} as Record<string, Voice[]>);

        // Sort each group alphabetically by voiceName
        Object.keys(grouped).forEach(provider => {
          grouped[provider].sort((a, b) => a.voiceName.localeCompare(b.voiceName));
        });

        // Sort providers alphabetically
        const sortedProviders = Object.keys(grouped).sort();

        // Flatten back to array maintaining group order
        return sortedProviders.flatMap(provider => grouped[provider]);
      })
    );
  }

  getVoiceDisplayName(voice: Voice): string {
    if (voice.displayName) {
      return voice.displayName;
    }
    return `${voice.providerName} - ${voice.voiceName}`;
  }

  voiceKey(voice: Pick<Voice, 'providerName' | 'voiceId'>): string {
    return `${voice.providerName}::${voice.voiceId}`;
  }

  previewVoice(
    voice: Voice,
    options?: { message?: string; tweaks?: VoiceTweakSettings; skipPreviewUrl?: boolean },
  ): Observable<unknown> {
    const previewPayload: {
      voiceProvider: string;
      voiceId: string;
      previewUrl?: string;
      message?: string;
      tweaks?: VoiceTweakSettings;
    } = {
      voiceProvider: voice.providerName,
      voiceId: voice.voiceId,
    };

    if (options?.message) {
      previewPayload.message = options.message;
    }
    if (options?.tweaks) {
      previewPayload.tweaks = options.tweaks;
    }

    const usePreviewUrl =
      !options?.skipPreviewUrl &&
      !options?.message &&
      options?.tweaks == null &&
      !!voice.previewUrl;
    if (usePreviewUrl && voice.previewUrl) {
      previewPayload.previewUrl = voice.previewUrl;
    }

    return this.http.post(`${this.apiUrl}/speak/preview`, previewPayload);
  }
}

