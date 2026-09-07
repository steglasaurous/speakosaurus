import { Injectable } from '@angular/core';

export const TWITCH_OAUTH_RETURN_KEY = 'speakosaurus_twitch_oauth_return';
export const TWITCH_OAUTH_STATE_KEY = 'speakosaurus_twitch_oauth_state';
export const TWITCH_OAUTH_TOKEN_KEY = 'twitch_oauth_token';

export interface TwitchOAuthReturn {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  errorDescription?: string | null;
  scope?: string | null;
}

/**
 * Captures Twitch OAuth query params before Angular hash routing can drop them.
 * Prefer calling from index.html; this is a safety net if that script is missing.
 */
export function captureTwitchOAuthReturnFromUrl(): TwitchOAuthReturn | null {
  try {
    const existing = sessionStorage.getItem(TWITCH_OAUTH_RETURN_KEY);
    if (existing) {
      return JSON.parse(existing) as TwitchOAuthReturn;
    }
  } catch {
    // ignore corrupt storage
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) {
    return null;
  }

  const payload: TwitchOAuthReturn = {
    code,
    state: params.get('state'),
    error,
    errorDescription: params.get('error_description'),
    scope: params.get('scope'),
  };
  sessionStorage.setItem(TWITCH_OAUTH_RETURN_KEY, JSON.stringify(payload));
  const clean = `${window.location.pathname}${window.location.hash || '#/remote-login'}`;
  window.history.replaceState({}, '', clean);
  return payload;
}

export function consumeTwitchOAuthReturn(): TwitchOAuthReturn | null {
  // Ensure we capture from the URL if Angular hasn't wiped it yet.
  captureTwitchOAuthReturnFromUrl();
  const raw = sessionStorage.getItem(TWITCH_OAUTH_RETURN_KEY);
  if (!raw) {
    return null;
  }
  sessionStorage.removeItem(TWITCH_OAUTH_RETURN_KEY);
  try {
    return JSON.parse(raw) as TwitchOAuthReturn;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class TwitchOAuthReturnService {
  peek(): TwitchOAuthReturn | null {
    return captureTwitchOAuthReturnFromUrl();
  }

  consume(): TwitchOAuthReturn | null {
    return consumeTwitchOAuthReturn();
  }
}
