import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { StatusBarComponent } from './components/status-bar/status-bar.component';
import { SettingsComponent } from './components/settings/settings.component';
import { VoicePlaygroundComponent } from './components/voice-playground/voice-playground.component';
import { AudioService } from './services/audio.service';
import { SettingsService } from './services/settings.service';
import { filter } from 'rxjs/operators';

@Component({
  imports: [CommonModule, RouterModule, StatusBarComponent, SettingsComponent, VoicePlaygroundComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected title = 'client';
  settingsModalOpen = false;
  playgroundModalOpen = false;
  private audioService = inject(AudioService);
  private settingsService = inject(SettingsService);
  private router = inject(Router);
  private setupCheckCompleted = false;
  private previousBodyOverflow = '';
  private isBodyScrollLocked = false;

  ngOnInit(): void {
    // Check setup status on app initialization
    this.checkSetupStatus();

    // Also check on navigation to ensure user completes setup
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkSetupStatus();
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

  private checkSetupStatus(): void {
    // Don't check if we're already on the setup page or setup check is completed
    const currentPath = this.router.url;
    if (currentPath.startsWith('/setup') || this.setupCheckCompleted) {
      return;
    }

    // Get setup completion status
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        const setupSetting = settings.find((s) => s.name === 'setupCompleted');
        const isSetupCompleted = setupSetting?.value === 'true';

        if (!isSetupCompleted) {
          // Redirect to setup wizard
          this.router.navigate(['/setup']);
        } else {
          this.setupCheckCompleted = true;
        }
      },
      error: (error) => {
        console.error('Error checking setup status:', error);
        // On error, assume setup is needed
        if (!currentPath.startsWith('/setup')) {
          this.router.navigate(['/setup']);
        }
      },
    });
  }
}
