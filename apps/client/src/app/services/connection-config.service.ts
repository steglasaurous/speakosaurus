import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LOCAL_API_URL } from '../constants';

export type ConnectionMode = 'local' | 'remote';

export interface ConnectionConfig {
  mode: ConnectionMode;
  apiUrl: string;
  bridgeOrigin?: string;
  moderatorToken?: string;
  sessionId?: string;
  broadcasterUsername?: string;
  twitchAccessToken?: string;
  modTwitchUsername?: string;
}

const STORAGE_KEY = 'speakosaurus_connection_config';

function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { AppBridge?: unknown }).AppBridge;
}

function defaultConfig(): ConnectionConfig {
  if (isElectronRuntime()) {
    return { mode: 'local', apiUrl: LOCAL_API_URL };
  }
  // Browser: same-origin bridge API
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    mode: 'remote',
    apiUrl: `${origin}/api/moderator`,
    bridgeOrigin: origin,
  };
}

@Injectable({
  providedIn: 'root',
})
export class ConnectionConfigService {
  private readonly configSubject: BehaviorSubject<ConnectionConfig>;
  readonly config$: Observable<ConnectionConfig>;

  constructor() {
    const stored = this.loadFromStorage();
    const initial = stored ?? defaultConfig();
    // Electron always starts local unless explicitly set remote later (future).
    if (isElectronRuntime() && initial.mode === 'remote' && !initial.moderatorToken) {
      this.configSubject = new BehaviorSubject(defaultConfig());
    } else {
      this.configSubject = new BehaviorSubject(initial);
    }
    this.config$ = this.configSubject.asObservable();
  }

  getConfig(): ConnectionConfig {
    return this.configSubject.value;
  }

  getApiUrl(): string {
    return this.configSubject.value.apiUrl;
  }

  isRemoteMode(): boolean {
    return this.configSubject.value.mode === 'remote';
  }

  isLocalMode(): boolean {
    return this.configSubject.value.mode === 'local';
  }

  isElectron(): boolean {
    return isElectronRuntime();
  }

  setLocalMode(): void {
    this.updateConfig({ mode: 'local', apiUrl: LOCAL_API_URL });
  }

  setRemoteSession(params: {
    bridgeOrigin: string;
    sessionId: string;
    moderatorToken: string;
    broadcasterUsername: string;
    twitchAccessToken?: string;
    modTwitchUsername?: string;
  }): void {
    this.updateConfig({
      mode: 'remote',
      apiUrl: `${params.bridgeOrigin.replace(/\/$/, '')}/api/moderator`,
      bridgeOrigin: params.bridgeOrigin.replace(/\/$/, ''),
      sessionId: params.sessionId,
      moderatorToken: params.moderatorToken,
      broadcasterUsername: params.broadcasterUsername,
      twitchAccessToken: params.twitchAccessToken,
      modTwitchUsername: params.modTwitchUsername,
    });
  }

  clearRemoteSession(): void {
    const origin =
      this.configSubject.value.bridgeOrigin ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    this.updateConfig({
      mode: 'remote',
      apiUrl: `${origin}/api/moderator`,
      bridgeOrigin: origin,
    });
  }

  private updateConfig(config: ConnectionConfig): void {
    this.configSubject.next(config);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore storage failures
    }
  }

  private loadFromStorage(): ConnectionConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ConnectionConfig;
    } catch {
      return null;
    }
  }
}
