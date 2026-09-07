import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConnectionConfigService } from './connection-config.service';
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
  private http = inject(HttpClient);
  private connection = inject(ConnectionConfigService);

  create(body: CreateCustomVoiceRequest): Observable<Voice> {
    return this.http.post<Voice>(`${this.connection.getApiUrl()}/custom-voices`, body);
  }

  update(id: string, body: UpdateCustomVoiceRequest): Observable<Voice> {
    return this.http.put<Voice>(`${this.connection.getApiUrl()}/custom-voices/${id}`, body);
  }

  delete(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.connection.getApiUrl()}/custom-voices/${id}`);
  }
}
