import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  JSON = 'json',
  ENUM = 'enum',
  VOICE = 'voice',
  USER_LIST = 'userList',
  STREAMERBOT_ACTION = 'streamerbotAction',
}

export interface Setting {
  name: string;
  displayName: string;
  group: string;
  subGroup?: string;
  description: string;
  type: SettingType;
  default?: string;
  options?: string[];
  optionDescriptions?: { [key: string]: string };
  sensitive?: boolean;
  required?: boolean;
  value: string | null;
}

export interface UpdateSettingRequest {
  value?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private apiUrl = 'http://localhost:3000/api';
  private http = inject(HttpClient);

  getAllSettings(): Observable<Setting[]> {
    return this.http.get<Setting[]>(`${this.apiUrl}/settings`);
  }

  getSetting(name: string): Observable<Setting> {
    return this.http.get<Setting>(`${this.apiUrl}/settings/${name}`);
  }

  updateSetting(name: string, value: string): Observable<Setting> {
    return this.http.put<Setting>(`${this.apiUrl}/settings/${name}`, { value });
  }
}

