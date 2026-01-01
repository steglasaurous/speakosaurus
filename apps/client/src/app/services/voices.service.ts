import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Voice {
  voiceId: string;
  providerName: string;
  voiceName: string;
  displayName?: string;
  group?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VoicesService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

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
          (voice.displayName && voice.displayName.toLowerCase().includes(lowerQuery))
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
}

