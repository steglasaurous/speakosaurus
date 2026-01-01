import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CustomIntro {
  id: string;
  twitchUserId: string;
  introText: string;
}

export interface User {
  twitchUserId: string;
  twitchUsername: string;
  ttsName?: string;
  ttsProviderName?: string;
  ttsVoiceId?: string;
  customIntros: CustomIntro[];
}

export interface UpdateUserRequest {
  ttsName?: string;
  ttsProviderName?: string;
  ttsVoiceId?: string;
}

export interface CreateCustomIntroRequest {
  introText: string;
}

export interface UpdateCustomIntroRequest {
  introText: string;
}

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  getUser(twitchUserId: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${twitchUserId}`);
  }

  updateUser(twitchUserId: string, updates: UpdateUserRequest): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${twitchUserId}`, updates);
  }

  addCustomIntro(twitchUserId: string, introText: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/${twitchUserId}/intros`,
      { introText }
    );
  }

  updateCustomIntro(introId: string, introText: string): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/intros/${introId}`,
      { introText }
    );
  }

  deleteCustomIntro(introId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/users/intros/${introId}`
    );
  }
}

