import { Component, inject, OnDestroy, OnInit } from '@angular/core';

import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { SettingsComponent } from './components/settings/settings.component';
import { VoicePlaygroundComponent } from './components/voice-playground/voice-playground.component';
import { AudioService } from './services/audio.service';
import { SettingsService } from './services/settings.service';
import { ConnectionConfigService } from './services/connection-config.service';
import {
  TWITCH_OAUTH_RETURN_KEY,
  captureTwitchOAuthReturnFromUrl,
} from './services/twitch-oauth-return';
import { filter } from 'rxjs/operators';

@Component({
  imports: [RouterModule, StatusBarComponent, SettingsComponent, VoicePlaygroundComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected title = 'Speakosaurus';
  settingsModalOpen = false;
  playgroundModalOpen = false;
  hideChrome = false;
  private audioService = inject(AudioService);
  private settingsService = inject(SettingsService);
  private connection = inject(ConnectionConfigService);
  private router = inject(Router);
  private setupCheckCompleted = false;
  private previousBodyOverflow = '';
  private isBodyScrollLocked = false;

  ngOnInit(): void {
    if (!this.connection.isElectron()) {
      // Safety net if index.html stash missed the redirect (e.g. cached old index).
      captureTwitchOAuthReturnFromUrl();
      if (sessionStorage.getItem(TWITCH_OAUTH_RETURN_KEY)) {
        void this.router.navigate(['/remote-login']);
      }
      this.ensureRemoteSession();
    } else {
      this.checkSetupStatus();
    }

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = (event as NavigationEnd).urlAfterRedirects || this.router.url;
        this.hideChrome =
          url.startsWith('/remote-login') || url.startsWith('/twitch-callback');
        if (!this.connection.isElectron()) {
          this.ensureRemoteSession();
        } else {
          this.checkSetupStatus();
        }
      });
  }

  openSettings(): void {
    this.playgroundModalOpen = false;
    this.settingsModalOpen = true;
    this.lockBodyScroll();
  }

  closeSettings(): void {
    this.settingsModalOpen = false;
    this.unlockBodyScrollIfIdle();
  }

  openPlayground(): void {
    this.settingsModalOpen = false;
    this.playgroundModalOpen = true;
    this.lockBodyScroll();
  }

  closePlayground(): void {
    this.playgroundModalOpen = false;
    this.unlockBodyScrollIfIdle();
  }

  private lockBodyScroll(): void {
    if (this.isBodyScrollLocked) {
      return;
    }
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.isBodyScrollLocked = true;
  }

  private unlockBodyScrollIfIdle(): void {
    if (this.settingsModalOpen || this.playgroundModalOpen) {
      return;
    }
    this.restoreBodyScrolling();
  }

  private restoreBodyScrolling(): void {
    if (!this.isBodyScrollLocked) {
      return;
    }

    document.body.style.overflow = this.previousBodyOverflow;
    this.isBodyScrollLocked = false;
  }

  ngOnDestroy(): void {
    this.restoreBodyScrolling();
  }

  private ensureRemoteSession(): void {
    const path = this.router.url;
    if (
      path.startsWith('/remote-login') ||
      path.startsWith('/twitch-callback') ||
      // Pending auth-code exchange (stashed before hash routing wiped ?code=)
      !!sessionStorage.getItem(TWITCH_OAUTH_RETURN_KEY)
    ) {
      return;
    }
    const cfg = this.connection.getConfig();
    if (!cfg.moderatorToken || !cfg.sessionId) {
      void this.router.navigate(['/remote-login']);
    }
  }

  private checkSetupStatus(): void {
    const currentPath = this.router.url;
    if (currentPath.startsWith('/setup') || this.setupCheckCompleted) {
      return;
    }

    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        const setupSetting = settings.find((s) => s.name === 'setupCompleted');
        const isSetupCompleted = setupSetting?.value === 'true';

        if (!isSetupCompleted) {
          this.router.navigate(['/setup']);
        } else {
          this.setupCheckCompleted = true;
        }
      },
      error: (error) => {
        console.error('Error checking setup status:', error);
        if (!currentPath.startsWith('/setup')) {
          this.router.navigate(['/setup']);
        }
      },
    });
  }
}
