import { Component, OnInit, inject } from '@angular/core';

@Component({
  selector: 'app-twitch-callback',
  standalone: true,
  imports: [],
  template: `
    <div class="callback-container">
      <div class="callback-content">
        @if (processing) {
          <div class="processing">
            <div class="spinner"></div>
            <p>Completing authentication...</p>
          </div>
        }
        @if (error) {
          <div class="error">
            <p>{{ error }}</p>
            <button (click)="closeWindow()">Close</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .callback-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: #f5f5f7;
      }
      .callback-content {
        text-align: center;
        padding: 24px;
      }
      .processing p {
        margin-top: 16px;
        color: #86868b;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e5e5e7;
        border-top-color: #007aff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .error {
        color: #ff3b30;
      }
      .error button {
        margin-top: 16px;
        padding: 8px 16px;
        background: #007aff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
    `,
  ],
})
export class TwitchCallbackComponent implements OnInit {
  processing = true;
  error: string | null = null;

  ngOnInit(): void {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    // Supports `#/twitch-callback?access_token=...` (rewritten from Twitch fragment)
    const queryPart = rawHash.includes('?') ? rawHash.split('?')[1] : rawHash;
    const params = new URLSearchParams(queryPart);
    const accessToken = params.get('access_token');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      this.processing = false;
      this.error = errorDescription || error || 'Authentication failed';
      if (window.opener) {
        window.opener.postMessage(
          { type: 'TWITCH_AUTH_ERROR', error: this.error },
          window.location.origin,
        );
      }
      return;
    }

    if (accessToken && window.opener) {
      window.opener.postMessage(
        { type: 'TWITCH_AUTH_SUCCESS', token: accessToken },
        window.location.origin,
      );
      this.processing = false;
      setTimeout(() => window.close(), 500);
      return;
    }

    if (accessToken && !window.opener) {
      // Fallback: store token for same-window flows
      sessionStorage.setItem('twitch_oauth_token', accessToken);
      this.processing = false;
      window.location.hash = '/remote-login';
      return;
    }

    this.processing = false;
    this.error = 'No access token received';
    setTimeout(() => window.close(), 2000);
  }

  closeWindow(): void {
    window.close();
  }
}
