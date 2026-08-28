import { Component, EventEmitter, HostListener, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { UsersService, User, CustomIntro } from '../../services/users.service';
import { VoicesService, Voice } from '../../services/voices.service';
import { SettingsService } from '../../services/settings.service';
import { forkJoin } from 'rxjs';
import { VoiceSelectorComponent } from '../voice-selector/voice-selector.component';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, VoiceSelectorComponent],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent implements OnInit {
  user: User | null = null;
  @Input() twitchUserId = '';
  @Input() modalMode = false;
  @Output() closed = new EventEmitter<void>();

  // Voice selection
  selectedVoice: Voice | null = null;

  // Form fields
  ttsName = '';
  pronouns = '';
  disableWelcome = false;
  customIntros: CustomIntro[] = [];

  // Loading and error states
  loading = false;
  saving = false;
  error: string | null = null;
  playingTtsName = false;
  playingIntros: Set<number> = new Set();

  // Track original values to detect changes
  private originalTtsName: string | null = null;
  private originalPronouns: string | null = null;
  private originalDisableWelcome: boolean | null = null;
  private originalVoice: { providerName: string; voiceId: string; tweaks?: Voice['tweaks'] } | null = null;
  private originalCustomIntros: CustomIntro[] = [];

  private router = inject(Router);
  private usersService = inject(UsersService);
  private voicesService = inject(VoicesService);
  private settingsService = inject(SettingsService);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api';

  ngOnInit(): void {
    if (!this.twitchUserId) {
      this.twitchUserId = this.route.snapshot.paramMap.get('twitchUserId') || '';
    }

    if (!this.twitchUserId) {
      if (this.modalMode) {
        this.closed.emit();
      } else {
        this.router.navigate(['/users']);
      }
      return;
    }

    this.loadUser();
  }

  loadUser(): void {
    this.loading = true;
    this.usersService.getUser(this.twitchUserId).subscribe({
      next: (user) => {
        this.user = user;
        this.ttsName = user.ttsName || '';
        this.pronouns = user.pronouns || '';
        this.disableWelcome = user.disableWelcome || false;
        this.customIntros = [...(user.customIntros || [])].map(intro => ({ ...intro }));

        // Store original values to detect changes
        this.originalTtsName = user.ttsName || null;
        this.originalPronouns = user.pronouns || null;
        this.originalDisableWelcome = user.disableWelcome || false;
        this.originalVoice = user.ttsProviderName && user.ttsVoiceId
          ? { providerName: user.ttsProviderName, voiceId: user.ttsVoiceId, tweaks: user.ttsTweaks }
          : null;
        this.originalCustomIntros = [...(user.customIntros || [])].map(intro => ({ ...intro }));

        // Set selected voice if user has one
        if (user.ttsProviderName && user.ttsVoiceId) {
          this.voicesService.getVoices().subscribe({
            next: (voices) => {
              const found = voices.find(
                (v) => v.providerName === user.ttsProviderName && v.voiceId === user.ttsVoiceId
              ) || null;
              this.selectedVoice = found
                ? { ...found, tweaks: user.ttsTweaks ?? found.tweaks }
                : null;
            },
          });
        } else {
          this.selectedVoice = null;
        }

        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading user:', error);
        this.error = 'Failed to load user';
        this.loading = false;
      },
    });
  }

  onVoiceSelected(voice: Voice | null): void {
    this.selectedVoice = voice;
  }

  addIntro(): void {
    this.customIntros.push({
      id: `temp-${Date.now()}`,
      twitchUserId: this.twitchUserId,
      introText: '',
    });
  }

  removeIntro(index: number): void {
    const intro = this.customIntros[index];
    if (intro.id.startsWith('temp-')) {
      // New intro, just remove from array
      this.customIntros.splice(index, 1);
    } else {
      // Existing intro, delete from server
      this.usersService.deleteCustomIntro(intro.id).subscribe({
        next: () => {
          this.customIntros.splice(index, 1);
        },
        error: (error) => {
          console.error('Error deleting intro:', error);
          this.error = 'Failed to delete intro';
        },
      });
    }
  }

  playTtsName(): void {
    if (!this.ttsName || this.playingTtsName) {
      return;
    }

    this.playingTtsName = true;

    // Build payload with optional voice parameters
    const speakPayload: any = {
      message: this.ttsName,
      pronouns: this.pronouns || undefined,
    };

    // Only include voice parameters if a voice is selected
    if (this.selectedVoice) {
      speakPayload.voiceProvider = this.selectedVoice.providerName;
      speakPayload.voiceId = this.selectedVoice.voiceId;
      if (this.selectedVoice.tweaks) {
        speakPayload.tweaks = this.selectedVoice.tweaks;
      }
    }
    // If no voice is selected, the API will use the pronoun-specific or global default.

    this.http.post(`${this.apiUrl}/speak`, speakPayload).subscribe({
      next: () => {
        console.log('TTS name queued for playback');
        // Reset playing state after a delay (we can't easily detect when it finishes)
        // Estimate duration based on text length (roughly 150 words per minute)
        const estimatedDuration = Math.max(2000, (this.ttsName.length / 10) * 1000);
        setTimeout(() => {
          this.playingTtsName = false;
        }, estimatedDuration);
      },
      error: (error) => {
        console.error('Error playing TTS name:', error);
        this.playingTtsName = false;
        this.error = 'Failed to play TTS name';
      },
    });
  }

  playIntro(index: number): void {
    const intro = this.customIntros[index];
    if (!intro || !intro.introText || this.playingIntros.has(index)) {
      return;
    }

    this.playingIntros.add(index);

    // Get the default intro voice from settings
    this.settingsService.getSetting('defaultIntroVoice').subscribe({
      next: (setting) => {
        const speakPayload: any = {
          message: intro.introText,
        };

        // If default intro voice is set, use it; otherwise use default voice
        if (setting && setting.value) {
          try {
            const voiceData = JSON.parse(setting.value);
            if (voiceData.voiceId && voiceData.providerName) {
              speakPayload.voiceProvider = voiceData.providerName;
              speakPayload.voiceId = voiceData.voiceId;
              if (voiceData.tweaks) {
                speakPayload.tweaks = voiceData.tweaks;
              }
            }
          } catch (error) {
            console.warn('Failed to parse default intro voice setting', error);
            // Will fall back to default voice
          }
        }

        this.http.post(`${this.apiUrl}/speak`, speakPayload).subscribe({
          next: () => {
            console.log('Intro queued for playback');
            // Estimate duration based on text length
            const estimatedDuration = Math.max(2000, (intro.introText.length / 10) * 1000);
            setTimeout(() => {
              this.playingIntros.delete(index);
            }, estimatedDuration);
          },
          error: (error) => {
            console.error('Error playing intro:', error);
            this.playingIntros.delete(index);
            this.error = 'Failed to play intro';
          },
        });
      },
      error: (error) => {
        console.error('Error getting default intro voice setting:', error);
        // Fall back to using default voice (no voice parameters)
        const speakPayload: any = {
          message: intro.introText,
        };
        this.http.post(`${this.apiUrl}/speak`, speakPayload).subscribe({
          next: () => {
            console.log('Intro queued for playback');
            const estimatedDuration = Math.max(2000, (intro.introText.length / 10) * 1000);
            setTimeout(() => {
              this.playingIntros.delete(index);
            }, estimatedDuration);
          },
          error: (err) => {
            console.error('Error playing intro:', err);
            this.playingIntros.delete(index);
            this.error = 'Failed to play intro';
          },
        });
      },
    });
  }

  saveChanges(): void {
    if (!this.user) return;

    this.saving = true;
    this.error = null;

    const updates: any = {
      ttsName: this.ttsName || undefined,
      pronouns: this.pronouns || null,
      disableWelcome: this.disableWelcome || undefined,
    };

    if (this.selectedVoice) {
      updates.ttsProviderName = this.selectedVoice.providerName;
      updates.ttsVoiceId = this.selectedVoice.voiceId;
      updates.ttsTweaks = this.selectedVoice.tweaks ?? null;
    } else {
      updates.ttsProviderName = undefined;
      updates.ttsVoiceId = undefined;
      updates.ttsTweaks = null;
    }

    // Update user
    this.usersService.updateUser(this.twitchUserId, updates).subscribe({
      next: (updatedUser) => {
        // Save/update custom intros
        const introObservables = this.customIntros
          .map((intro) => {
            if (intro.id.startsWith('temp-')) {
              // New intro
              return this.usersService.addCustomIntro(this.twitchUserId, intro.introText);
            } else {
              // Update existing intro if text changed
              const originalIntro = this.user?.customIntros.find((i) => i.id === intro.id);
              if (originalIntro && originalIntro.introText !== intro.introText) {
                return this.usersService.updateCustomIntro(intro.id, intro.introText);
              }
            }
            return null;
          })
          .filter((obs) => obs !== null) as any[];

        if (introObservables.length === 0) {
          this.saving = false;
          this.finishSuccessfulSave();
          return;
        }

        // Use forkJoin to wait for all intro operations
        forkJoin(introObservables).subscribe({
          next: () => {
            this.saving = false;
            this.finishSuccessfulSave();
          },
          error: (error) => {
            console.error('Error saving intros:', error);
            this.error = 'Failed to save some intros';
            this.saving = false;
          },
        });
      },
      error: (error) => {
        console.error('Error updating user:', error);
        this.error = 'Failed to save changes';
        this.saving = false;
      },
    });
  }

  hasUnsavedChanges(): boolean {
    // Check TTS name
    const currentTtsName = this.ttsName || null;
    if (currentTtsName !== this.originalTtsName) {
      return true;
    }

    // Check pronouns
    const currentPronouns = this.pronouns || null;
    if (currentPronouns !== this.originalPronouns) {
      return true;
    }

    // Check disableWelcome
    if (this.disableWelcome !== this.originalDisableWelcome) {
      return true;
    }

    // Check voice selection
    const currentVoice = this.selectedVoice
      ? {
          providerName: this.selectedVoice.providerName,
          voiceId: this.selectedVoice.voiceId,
          tweaks: this.selectedVoice.tweaks,
        }
      : null;
    const originalVoiceProvider = this.originalVoice?.providerName || null;
    const originalVoiceId = this.originalVoice?.voiceId || null;
    const currentVoiceProvider = currentVoice?.providerName || null;
    const currentVoiceId = currentVoice?.voiceId || null;

    if (originalVoiceProvider !== currentVoiceProvider || originalVoiceId !== currentVoiceId) {
      return true;
    }

    if (JSON.stringify(currentVoice?.tweaks ?? {}) !== JSON.stringify(this.originalVoice?.tweaks ?? {})) {
      return true;
    }

    // Check custom intros
    // Compare lengths first
    if (this.customIntros.length !== this.originalCustomIntros.length) {
      return true;
    }

    // Compare each intro
    for (let i = 0; i < this.customIntros.length; i++) {
      const current = this.customIntros[i];
      const original = this.originalCustomIntros.find(intro => intro.id === current.id);

      // New intro (temp ID) or intro not found in original
      if (current.id.startsWith('temp-') || !original) {
        return true;
      }

      // Intro text changed
      if (current.introText !== original.introText) {
        return true;
      }
    }

    // Check if any original intros were removed
    for (const original of this.originalCustomIntros) {
      const found = this.customIntros.find(intro => intro.id === original.id);
      if (!found) {
        return true;
      }
    }

    return false;
  }

  private finishSuccessfulSave(): void {
    if (this.modalMode) {
      this.closed.emit();
    } else {
      this.loadUser();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.modalMode) {
      this.requestClose();
    }
  }

  onBackClick(event: Event): void {
    event.preventDefault();
    this.requestClose();
  }

  requestClose(): void {
    if (this.hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (!confirmed) {
        return;
      }
    }

    if (this.modalMode) {
      this.closed.emit();
    } else {
      this.router.navigate(['/users']);
    }
  }
}

