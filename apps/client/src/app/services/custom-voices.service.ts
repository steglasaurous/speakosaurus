import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Voice, VoiceTweakSettings } from './voices.service';

export interface CreateCustomVoiceRequest {
  displayName: string;
  providerName: string;
  baseVoiceId: string;
  tweaks?: VoiceTweakSettings;
}

export interface UpdateCustomVoiceRequest {
  displayName?: string;
  tweaks?: VoiceTweakSettings;
}

@Injectable({
  providedIn: 'root',
})
export class CustomVoicesService {
  private apiUrl = 'http://localhost:3000/api';
  private http = inject(HttpClient);

  create(body: CreateCustomVoiceRequest): Observable<Voice> {
    return this.http.post<Voice>(`${this.apiUrl}/custom-voices`, body);
  }

  update(id: string, body: UpdateCustomVoiceRequest): Observable<Voice> {
    return this.http.put<Voice>(`${this.apiUrl}/custom-voices/${id}`, body);
  }

  delete(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/custom-voices/${id}`);
  }
}
