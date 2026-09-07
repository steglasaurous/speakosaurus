import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ConnectionConfigService } from '../../services/connection-config.service';
import {
  TWITCH_OAUTH_STATE_KEY,
  TWITCH_OAUTH_TOKEN_KEY,
  consumeTwitchOAuthReturn,
} from '../../services/twitch-oauth-return';

interface BridgeConfig {
  twitchClientId: string;
  publicUrl: string;
}

@Component({
  selector: 'app-remote-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="remote-shell">
      <div class="panel">
        <p class="brand">Speakosaurus</p>
        <h1>Remote access</h1>
        <p class="lede">Sign in with Twitch to control a broadcaster's Speakosaurus.</p>

        @if (error) {
          <p class="error">{{ error }}</p>
        }

        @if (loading && !twitchToken) {
          <p class="ok">Completing Twitch login…</p>
        }

        @if (!twitchToken && !loading) {
          <button type="button" class="primary" (click)="loginWithTwitch()">
            Log in with Twitch
          </button>
        } @else if (twitchToken) {
          <p class="ok">Signed in as {{ displayName || 'Twitch user' }}</p>
          <label>
            Broadcaster channel
            <input
              type="text"
              [(ngModel)]="broadcasterUsername"
              placeholder="channel name"
              autocomplete="off"
            />
          </label>
          <button
            type="button"
            class="primary"
            [disabled]="loading || !broadcasterUsername.trim()"
            (click)="connectToChannel()"
          >
            {{ loading ? 'Connecting…' : 'Connect' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .remote-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        background:
          radial-gradient(circle at 20% 20%, #1d4f6f33, transparent 45%),
          radial-gradient(circle at 80% 0%, #c45c2633, transparent 40%),
          linear-gradient(160deg, #0f1418, #1a2229 55%, #12171c);
        color: #f2ebe3;
        font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      }
      .panel {
        width: min(420px, 100%);
        display: grid;
        gap: 1rem;
      }
      .brand {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.03em;
      }
      h1 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .lede,
      .ok {
        margin: 0;
        color: #c9c0b4;
        line-height: 1.45;
      }
      label {
        display: grid;
        gap: 0.4rem;
        font-size: 0.9rem;
      }
      input {
        padding: 0.7rem 0.8rem;
        border-radius: 8px;
        border: 1px solid #3a4550;
        background: #0c1014;
        color: inherit;
      }
      .primary {
        padding: 0.75rem 1rem;
        border: 0;
        border-radius: 8px;
        background: #e8a87c;
        color: #1a120c;
        font-weight: 600;
        cursor: pointer;
      }
      .primary:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .error {
        color: #ff8f8f;
        margin: 0;
      }
    `,
  ],
})
export class RemoteLoginComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private connection = inject(ConnectionConfigService);

  loading = false;
  error: string | null = null;
  twitchToken: string | null = null;
  displayName = '';
  broadcasterUsername = '';
  private clientId = '';
  private bridgeOrigin = '';

  ngOnInit(): void {
    if (this.connection.isElectron()) {
      void this.router.navigate(['/users']);
      return;
    }

    const cfg = this.connection.getConfig();
    if (cfg.moderatorToken && cfg.broadcasterUsername) {
      void this.router.navigate(['/users']);
      return;
    }

    this.bridgeOrigin = window.location.origin;
    window.addEventListener('message', this.onAuthMessage);

    // Auth-code return is stashed in sessionStorage by index.html before Angular
    // hash routing can drop ?code=&state= from the URL.
    const oauthReturn = consumeTwitchOAuthReturn();
    if (oauthReturn?.error) {
      this.error = oauthReturn.errorDescription || oauthReturn.error;
    } else if (oauthReturn?.code) {
      this.finishAuthCodeLogin(oauthReturn.code, oauthReturn.state ?? null);
      return;
    }

    // Fallback from implicit/popup callback storing token in sessionStorage
    const stored = sessionStorage.getItem(TWITCH_OAUTH_TOKEN_KEY);
    if (stored) {
      sessionStorage.removeItem(TWITCH_OAUTH_TOKEN_KEY);
      this.twitchToken = stored;
      this.displayName = 'Twitch user';
    }

    this.http.get<BridgeConfig>(`${this.bridgeOrigin}/api/moderator/config`).subscribe({
      next: (config) => {
        this.clientId = config.twitchClientId;
      },
      error: () => {
        this.error = 'Could not load bridge configuration.';
      },
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.onAuthMessage);
  }

  loginWithTwitch(): void {
    this.error = null;
    if (!this.clientId) {
      // Config may still be loading; fetch then redirect.
      this.loading = true;
      this.http.get<BridgeConfig>(`${this.bridgeOrigin}/api/moderator/config`).subscribe({
        next: (config) => {
          this.clientId = config.twitchClientId;
          this.loading = false;
          if (!this.clientId) {
            this.error = 'Twitch client ID is not configured on the bridge.';
            return;
          }
          this.redirectToTwitchAuthorize();
        },
        error: () => {
          this.loading = false;
          this.error = 'Could not load bridge configuration.';
        },
      });
      return;
    }
    this.redirectToTwitchAuthorize();
  }

  private redirectToTwitchAuthorize(): void {
    const redirectUri = `${this.bridgeOrigin}/`;
    const state = crypto.randomUUID();
    sessionStorage.setItem(TWITCH_OAUTH_STATE_KEY, state);
    const scopes = encodeURIComponent('user:read:email');
    const url =
      `https://id.twitch.tv/oauth2/authorize` +
      `?client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scopes}` +
      `&state=${encodeURIComponent(state)}`;
    // Same-window redirect — popup + postMessage is unreliable after Twitch (opener is often null).
    window.location.assign(url);
  }

  private finishAuthCodeLogin(code: string, state: string | null): void {
    const expected = sessionStorage.getItem(TWITCH_OAUTH_STATE_KEY);
    sessionStorage.removeItem(TWITCH_OAUTH_STATE_KEY);
    if (!expected || !state || expected !== state) {
      this.error = 'Twitch login state mismatch. Please try again.';
      return;
    }

    this.loading = true;
    const redirectUri = `${this.bridgeOrigin}/`;
    this.http
      .post<{
        accessToken: string;
        user?: { login?: string; displayName?: string };
      }>(`${this.bridgeOrigin}/api/moderator/oauth/token`, {
        code,
        redirectUri,
      })
      .subscribe({
        next: (res) => {
          this.twitchToken = res.accessToken;
          this.displayName = res.user?.displayName || res.user?.login || 'Twitch user';
          this.loading = false;
          if (!window.location.hash.includes('remote-login')) {
            void this.router.navigate(['/remote-login']);
          }
        },
        error: (err) => {
          this.loading = false;
          this.error =
            err?.error?.message || err?.message || 'Failed to complete Twitch login.';
        },
      });
  }

  connectToChannel(): void {
    if (!this.twitchToken || !this.broadcasterUsername.trim()) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.http
      .post<{
        accessToken: string;
        sessionId: string;
        broadcasterUsername: string;
        bridgeUrl: string;
        modTwitchUsername: string;
      }>(`${this.bridgeOrigin}/api/moderator/authenticate`, {
        twitchAccessToken: this.twitchToken,
        broadcasterUsername: this.broadcasterUsername.trim(),
      })
      .subscribe({
        next: (res) => {
          this.connection.setRemoteSession({
            bridgeOrigin: this.bridgeOrigin,
            sessionId: res.sessionId,
            moderatorToken: res.accessToken,
            broadcasterUsername: res.broadcasterUsername,
            twitchAccessToken: this.twitchToken || undefined,
            modTwitchUsername: res.modTwitchUsername,
          });
          this.loading = false;
          void this.router.navigate(['/users']);
        },
        error: (err) => {
          this.loading = false;
          this.error =
            err?.error?.message ||
            err?.message ||
            'Could not connect. Check that remote access is enabled and you are a mod.';
        },
      });
  }

  private onAuthMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (event.data?.type === 'TWITCH_AUTH_SUCCESS' && event.data.token) {
      this.twitchToken = event.data.token as string;
      this.displayName = 'Twitch user';
      this.error = null;
    }
    if (event.data?.type === 'TWITCH_AUTH_ERROR') {
      this.error = event.data.error || 'Twitch login failed';
    }
  };
}
