import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, interval, throwError } from 'rxjs';
import { catchError, switchMap, takeWhile, map } from 'rxjs/operators';
import { API_URL } from '../constants';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
}

export interface DeviceCodeInfo {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

@Injectable({
  providedIn: 'root',
})
export class TwitchService {
  private http = inject(HttpClient);
  private apiUrl = API_URL;

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): Observable<boolean> {
    return this.http.get<{ isAuthenticated: boolean }>(`${this.apiUrl}/twitch/auth/status`).pipe(
      map(response => response.isAuthenticated),
      catchError(() => of(false))
    );
  }

  /**
   * Start device code flow
   */
  startDeviceCodeFlow(): Observable<DeviceCodeInfo> {
    return this.http.post<DeviceCodeInfo>(`${this.apiUrl}/twitch/auth/device-code`, {});
  }

  /**
   * Poll for device code completion
   */
  pollDeviceCode(): Observable<{ success: boolean; error?: string }> {
    return this.http.get<{ success: boolean; error?: string }>(`${this.apiUrl}/twitch/auth/poll`);
  }

  /**
   * Poll for device code completion with automatic retry
   */
  pollDeviceCodeUntilComplete(intervalMs: number = 5000): Observable<{ success: boolean }> {
    return interval(intervalMs).pipe(
      switchMap(() => this.pollDeviceCode()),
      takeWhile(result => {
        // Continue while pending or slow_down, stop on success or expired
        return !result.success && result.error !== 'expired_token';
      }, true),
      map(result => {
        if (result.success) {
          return { success: true };
        }
        if (result.error === 'expired_token') {
          throw new Error('Device code expired. Please start a new authentication flow.');
        }
        // For authorization_pending or slow_down, return false to continue polling
        return { success: false };
      }),
      catchError(error => throwError(() => error))
    );
  }

  /**
   * Logout from Twitch
   */
  logout(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/twitch/auth/logout`, {});
  }

  /**
   * Search for Twitch users by username
   */
  searchUsers(query: string): Observable<TwitchUser[]> {
    if (!query || query.trim() === '') {
      return of([]);
    }

    const params = new HttpParams().set('query', query);
    return this.http.get<TwitchUser[]>(`${this.apiUrl}/twitch/users/search`, { params }).pipe(
      catchError((error) => {
        console.error('Error searching Twitch users:', error);
        return of([]);
      })
    );
  }

  /**
   * Get user by username
   */
  getUserByUsername(username: string): Observable<TwitchUser | null> {
    if (!username || username.trim() === '') {
      return of(null);
    }

    const params = new HttpParams().set('username', username);
    return this.http.get<TwitchUser | null>(`${this.apiUrl}/twitch/users/by-username`, { params }).pipe(
      catchError((error) => {
        console.error('Error getting Twitch user:', error);
        return of(null);
      })
    );
  }
}
