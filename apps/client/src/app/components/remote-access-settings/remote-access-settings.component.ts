import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { LOCAL_API_URL } from '../../constants';
import { ConnectionConfigService } from '../../services/connection-config.service';
import { TwitchService } from '../../services/twitch.service';

interface RemoteAccessStatus {
  enabled: boolean;
  connected: boolean;
  bridgeUrl: string;
  sessionId: string | null;
}

@Component({
  selector: 'app-remote-access-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="remote-access">
      <h3>Remote Access</h3>
      <p class="help">
        Allow channel moderators to control this Speakosaurus instance through the hosted bridge
        in their browser. Requires Twitch login with the <code>moderation:read</code> scope.
      </p>

      <div class="twitch-box">
        <div class="twitch-header">
          <h4>Twitch account</h4>
          @if (twitchAuthenticated) {
            <strong [class.ok]="hasModerationRead" [class.warn]="!hasModerationRead">
              {{ hasModerationRead ? 'Signed in (remote-ready)' : 'Signed in (missing moderation:read)' }}
            </strong>
          } @else {
            <strong class="bad">Not signed in</strong>
          }
        </div>

        @if (!hasModerationRead) {
          <p class="hint">
            Log out and sign in again so Twitch grants <code>moderation:read</code>, which is required
            to verify moderators.
          </p>
        }

        @if (deviceCodeInfo) {
          <div class="device-code">
            <p>Enter this code on Twitch:</p>
            <div class="code">{{ deviceCodeInfo.userCode }}</div>
            <button type="button" (click)="openVerificationUri()">Open verification URL</button>
            @if (isPollingAuth) {
              <p class="polling">Waiting for authorization…</p>
            }
          </div>
        }

        <div class="actions">
          @if (!twitchAuthenticated && !deviceCodeInfo) {
            <button type="button" class="primary" [disabled]="busy || isPollingAuth" (click)="loginTwitch()">
              Log in with Twitch
            </button>
          }
          @if (twitchAuthenticated) {
            <button type="button" class="danger" [disabled]="busy || status?.enabled === true" (click)="logoutTwitch()">
              Log out of Twitch
            </button>
            @if (!hasModerationRead) {
              <button type="button" class="primary" [disabled]="busy || isPollingAuth" (click)="reauthTwitch()">
                Re-authenticate
              </button>
            }
          }
          @if (deviceCodeInfo) {
            <button type="button" [disabled]="busy" (click)="cancelDeviceCode()">Cancel</button>
          }
        </div>
      </div>

      <label>
        Bridge URL
        <input type="url" [(ngModel)]="bridgeUrl" [disabled]="status?.enabled === true" />
      </label>

      <div class="status">
        <span>Status:</span>
        @if (status?.enabled) {
          <strong [class.ok]="status?.connected" [class.bad]="!status?.connected">
            {{ status?.connected ? 'Connected' : 'Enabled (disconnected)' }}
          </strong>
        } @else {
          <strong>Disabled</strong>
        }
      </div>

      @if (status?.sessionId) {
        <p class="mono">Session: {{ status?.sessionId }}</p>
      }

      @if (error) {
        <p class="error">{{ error }}</p>
      }
      @if (message) {
        <p class="ok-msg">{{ message }}</p>
      }

      <div class="actions">
        @if (!status?.enabled) {
          <button
            type="button"
            class="primary"
            [disabled]="busy || !twitchAuthenticated || !hasModerationRead"
            (click)="enable()"
          >
            {{ busy ? 'Enabling…' : 'Enable remote access' }}
          </button>
        } @else {
          <button type="button" [disabled]="busy" (click)="reconnect()">Reconnect</button>
          <button type="button" class="danger" [disabled]="busy" (click)="disable()">
            Disable
          </button>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .remote-access {
        display: grid;
        gap: 0.75rem;
        padding: 1rem 0;
      }
      .help,
      .hint {
        margin: 0;
        color: #666;
        line-height: 1.4;
      }
      .twitch-box {
        display: grid;
        gap: 0.65rem;
        padding: 0.85rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #fafafa;
      }
      .twitch-header {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: center;
      }
      .twitch-header h4 {
        margin: 0;
      }
      label {
        display: grid;
        gap: 0.35rem;
      }
      input {
        padding: 0.55rem 0.65rem;
        border: 1px solid #ccc;
        border-radius: 6px;
      }
      .status {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .ok {
        color: #1b7f3a;
      }
      .warn {
        color: #a66a00;
      }
      .bad {
        color: #a33;
      }
      .mono {
        font-family: ui-monospace, monospace;
        font-size: 0.85rem;
        word-break: break-all;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      button {
        padding: 0.55rem 0.9rem;
        border-radius: 6px;
        border: 1px solid #ccc;
        background: #f5f5f5;
        cursor: pointer;
      }
      .primary {
        background: #1d4f6f;
        border-color: #1d4f6f;
        color: #fff;
      }
      .danger {
        background: #8b2e2e;
        border-color: #8b2e2e;
        color: #fff;
      }
      .error {
        color: #a33;
        margin: 0;
      }
      .ok-msg {
        color: #1b7f3a;
        margin: 0;
      }
      .device-code {
        display: grid;
        gap: 0.5rem;
      }
      .code {
        font-family: ui-monospace, monospace;
        font-size: 1.4rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 0.6rem 0.8rem;
        background: #fff;
        border: 1px dashed #aaa;
        border-radius: 6px;
        width: fit-content;
      }
      .polling {
        margin: 0;
        color: #666;
      }
      code {
        font-size: 0.9em;
      }
    `,
  ],
})
export class RemoteAccessSettingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private connection = inject(ConnectionConfigService);
  private twitchService = inject(TwitchService);

  bridgeUrl = 'http://localhost:3333';
  status: RemoteAccessStatus | null = null;
  busy = false;
  error: string | null = null;
  message: string | null = null;

  twitchAuthenticated = false;
  hasModerationRead = false;
  deviceCodeInfo: { userCode: string; verificationUri: string } | null = null;
  isPollingAuth = false;
  private pollingSubscription: Subscription | null = null;

  private get apiUrl(): string {
    return this.connection.isRemoteMode() ? this.connection.getApiUrl() : LOCAL_API_URL;
  }

  ngOnInit(): void {
    this.refresh();
    this.refreshTwitchStatus();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  refresh(): void {
    this.http.get<RemoteAccessStatus>(`${this.apiUrl}/remote-access/status`).subscribe({
      next: (status) => {
        this.status = status;
        if (status.bridgeUrl) {
          this.bridgeUrl = status.bridgeUrl;
        }
      },
      error: () => {
        this.status = { enabled: false, connected: false, bridgeUrl: this.bridgeUrl, sessionId: null };
      },
    });
  }

  refreshTwitchStatus(): void {
    this.twitchService.getAuthStatus().subscribe({
      next: (status) => {
        this.twitchAuthenticated = status.isAuthenticated;
        this.hasModerationRead = status.hasModerationRead;
      },
      error: () => {
        this.twitchAuthenticated = false;
        this.hasModerationRead = false;
      },
    });
  }

  loginTwitch(): void {
    this.startDeviceCodeFlow();
  }

  reauthTwitch(): void {
    this.busy = true;
    this.error = null;
    this.message = null;
    this.twitchService.logout().subscribe({
      next: () => {
        this.busy = false;
        this.twitchAuthenticated = false;
        this.hasModerationRead = false;
        this.startDeviceCodeFlow();
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.message || err?.message || 'Failed to log out of Twitch';
      },
    });
  }

  logoutTwitch(): void {
    this.busy = true;
    this.error = null;
    this.message = null;
    this.twitchService.logout().subscribe({
      next: () => {
        this.busy = false;
        this.twitchAuthenticated = false;
        this.hasModerationRead = false;
        this.message = 'Logged out of Twitch.';
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.message || err?.message || 'Failed to log out of Twitch';
      },
    });
  }

  cancelDeviceCode(): void {
    this.stopPolling();
    this.deviceCodeInfo = null;
    this.isPollingAuth = false;
  }

  startDeviceCodeFlow(): void {
    this.error = null;
    this.message = null;
    this.deviceCodeInfo = null;
    this.isPollingAuth = true;

    this.twitchService.startDeviceCodeFlow().subscribe({
      next: (info) => {
        this.deviceCodeInfo = {
          userCode: info.userCode,
          verificationUri: info.verificationUri,
        };
        this.startPolling(info.interval * 1000);
      },
      error: (err) => {
        this.isPollingAuth = false;
        this.error = err?.error?.message || err?.message || 'Failed to start Twitch login';
      },
    });
  }

  openVerificationUri(): void {
    const uri = this.deviceCodeInfo?.verificationUri;
    if (!uri) {
      return;
    }
    if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
      (window as any).electron.openExternal(uri).catch(() => window.open(uri, '_blank'));
    } else {
      window.open(uri, '_blank');
    }
  }

  enable(): void {
    this.busy = true;
    this.error = null;
    this.message = null;
    this.http
      .post(`${this.apiUrl}/remote-access/enable`, { bridgeUrl: this.bridgeUrl })
      .subscribe({
        next: () => {
          this.busy = false;
          this.message = 'Remote access enabled.';
          this.refresh();
        },
        error: (err) => {
          this.busy = false;
          this.error = err?.error?.message || err?.message || 'Failed to enable remote access';
        },
      });
  }

  disable(): void {
    this.busy = true;
    this.error = null;
    this.message = null;
    this.http.post(`${this.apiUrl}/remote-access/disable`, {}).subscribe({
      next: () => {
        this.busy = false;
        this.message = 'Remote access disabled.';
        this.refresh();
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.message || err?.message || 'Failed to disable remote access';
      },
    });
  }

  reconnect(): void {
    this.busy = true;
    this.error = null;
    this.http.post(`${this.apiUrl}/remote-access/reconnect`, {}).subscribe({
      next: () => {
        this.busy = false;
        this.message = 'Reconnected.';
        this.refresh();
      },
      error: (err) => {
        this.busy = false;
        this.error = err?.error?.message || err?.message || 'Failed to reconnect';
      },
    });
  }

  private startPolling(intervalMs: number): void {
    this.stopPolling();
    this.pollingSubscription = this.twitchService.pollDeviceCodeUntilComplete(intervalMs).subscribe({
      next: (result) => {
        if (result.success) {
          this.isPollingAuth = false;
          this.deviceCodeInfo = null;
          this.message = 'Twitch login complete. You can enable remote access.';
          this.refreshTwitchStatus();
          this.stopPolling();
        }
      },
      error: (err) => {
        this.isPollingAuth = false;
        this.deviceCodeInfo = null;
        this.error = err?.message || 'Twitch authentication failed';
        this.stopPolling();
      },
    });
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = null;
  }
}
