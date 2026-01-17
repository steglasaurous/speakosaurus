import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService, Setting } from '../../services/settings.service';

enum SetupStep {
  StreamerBotUrl = 0,
  TtsProviders = 1,
}

@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup-wizard.component.html',
  styleUrl: './setup-wizard.component.scss',
})
export class SetupWizardComponent implements OnInit {
  currentStep = SetupStep.StreamerBotUrl;
  SetupStep = SetupStep;
  
  streamerBotUrl = '';
  loading = false;
  error: string | null = null;
  saving = false;
  
  private settingsService = inject(SettingsService);
  private router = inject(Router);

  ngOnInit(): void {
    this.loadCurrentSettings();
  }

  loadCurrentSettings(): void {
    this.loading = true;
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        const urlSetting = settings.find(s => s.name === 'streamerbotWebsocketUrl');
        if (urlSetting?.value) {
          this.streamerBotUrl = urlSetting.value;
        } else if (urlSetting?.default) {
          this.streamerBotUrl = urlSetting.default;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading settings:', error);
        this.error = 'Failed to load settings';
        this.loading = false;
      },
    });
  }

  get totalSteps(): number {
    return 2;
  }

  get isFirstStep(): boolean {
    return this.currentStep === 0;
  }

  get isLastStep(): boolean {
    return this.currentStep === this.totalSteps - 1;
  }

  nextStep(): void {
    if (this.currentStep === SetupStep.StreamerBotUrl) {
      // Save StreamerBot URL before proceeding
      this.saveStreamerBotUrl(() => {
        this.currentStep++;
      });
    } else {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  saveStreamerBotUrl(callback?: () => void): void {
    this.saving = true;
    this.error = null;
    
    this.settingsService.updateSetting('streamerbotWebsocketUrl', this.streamerBotUrl).subscribe({
      next: () => {
        this.saving = false;
        if (callback) {
          callback();
        }
      },
      error: (error) => {
        console.error('Error saving StreamerBot URL:', error);
        this.error = 'Failed to save StreamerBot URL';
        this.saving = false;
      },
    });
  }

  completeSetup(skipTtsConfig: boolean = true): void {
    this.saving = true;
    this.error = null;

    // Mark setup as completed
    this.settingsService.updateSetting('setupCompleted', 'true').subscribe({
      next: () => {
        this.saving = false;
        if (skipTtsConfig) {
          // Go to main app
          this.router.navigate(['/users']);
        } else {
          // Go to TTS Providers settings tab
          this.router.navigate(['/settings'], { queryParams: { tab: 'TTS Providers' } });
        }
      },
      error: (error) => {
        console.error('Error completing setup:', error);
        this.error = 'Failed to complete setup';
        this.saving = false;
      },
    });
  }

  openStreamerBotWebsite(): void {
    // Using window.open for Electron apps
    window.open('https://streamer.bot', '_blank');
  }
}
