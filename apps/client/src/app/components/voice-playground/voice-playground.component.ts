import { Component, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VoiceSelectorComponent } from '../voice-selector/voice-selector.component';
import { VoiceTweaksComponent } from '../voice-tweaks/voice-tweaks.component';
import {
  DEFAULT_VOICE_TWEAKS,
  Voice,
  VoiceTweakSettings,
  VoicesService,
} from '../../services/voices.service';
import { CustomVoicesService } from '../../services/custom-voices.service';

@Component({
  selector: 'app-voice-playground',
  standalone: true,
  imports: [CommonModule, FormsModule, VoiceSelectorComponent, VoiceTweaksComponent],
  templateUrl: './voice-playground.component.html',
  styleUrl: './voice-playground.component.scss',
})
export class VoicePlaygroundComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();
  @ViewChild(VoiceSelectorComponent) voiceSelector?: VoiceSelectorComponent;

  selectedVoice: Voice | null = null;
  sampleText = 'Welcome to the stream! Thanks for the follow, I really appreciate it.';
  tweaks: VoiceTweakSettings = { ...DEFAULT_VOICE_TWEAKS };
  customName = '';
  saving = false;
  deleting = false;
  statusMessage = '';
  errorMessage = '';
  playingSelected = false;

  private voicesService = inject(VoicesService);
  private customVoicesService = inject(CustomVoicesService);

  get supportedStyles(): string[] {
    return this.selectedVoice?.supportedStyles ?? [];
  }

  get saveLabel(): string {
    return this.selectedVoice?.isCustom ? 'Update customized voice' : 'Save customized voice';
  }

  ngOnInit(): void {
    this.voicesService.getVoices().subscribe({
      next: (voices) => {
        if (!this.selectedVoice && voices.length) {
          this.onVoiceSelected(voices[0]);
        }
      },
    });
  }

  requestClose(): void {
    this.closed.emit();
  }

  onVoiceSelected(voice: Voice | null): void {
    const sameVoice =
      !!this.selectedVoice &&
      !!voice &&
      this.selectedVoice.voiceId === voice.voiceId &&
      this.selectedVoice.providerName === voice.providerName;
    this.selectedVoice = voice;
    this.errorMessage = '';
    if (!sameVoice) {
      this.statusMessage = '';
    }
    if (!voice) {
      this.tweaks = { ...DEFAULT_VOICE_TWEAKS };
      this.customName = '';
      return;
    }
    if (sameVoice) {
      return;
    }
    this.tweaks = {
      ...DEFAULT_VOICE_TWEAKS,
      ...(voice.tweaks ?? {}),
    };
    this.customName = voice.isCustom
      ? voice.displayName || voice.voiceName
      : `${voice.displayName || voice.voiceName} custom`;
  }

  onTweaksChange(tweaks: VoiceTweakSettings): void {
    this.tweaks = tweaks;
  }

  playSelected(): void {
    if (!this.selectedVoice || this.selectedVoice.needsDownload) {
      return;
    }
    this.playingSelected = true;
    this.voicesService
      .previewVoice(this.selectedVoice, {
        message: this.sampleText,
        tweaks: this.tweaks,
        skipPreviewUrl: true,
      })
      .subscribe({
        next: () => {
          setTimeout(() => {
            this.playingSelected = false;
          }, 4000);
        },
        error: (error) => {
          console.error('Playground preview failed', error);
          this.playingSelected = false;
          this.errorMessage = 'Failed to play this voice.';
        },
      });
  }

  saveCustomVoice(): void {
    if (!this.selectedVoice || this.saving) {
      return;
    }
    this.saving = true;
    this.errorMessage = '';
    const displayName =
      this.customName.trim() ||
      `${this.selectedVoice.displayName || this.selectedVoice.voiceName} custom`;

    const request$ = this.selectedVoice.isCustom
      ? this.customVoicesService.update(this.selectedVoice.voiceId, {
          displayName,
          tweaks: this.tweaks,
        })
      : this.customVoicesService.create({
          displayName,
          providerName: this.selectedVoice.providerName,
          baseVoiceId: this.selectedVoice.baseVoiceId || this.selectedVoice.voiceId,
          tweaks: this.tweaks,
        });

    request$.subscribe({
      next: (saved) => {
        this.saving = false;
        this.statusMessage = this.selectedVoice?.isCustom
          ? `Updated “${saved.displayName || saved.voiceName}”`
          : `Saved “${saved.displayName || saved.voiceName}” to Custom`;
        this.voiceSelector?.reloadVoices(true);
        this.onVoiceSelected(saved);
      },
      error: (error) => {
        console.error('Failed to save custom voice', error);
        this.saving = false;
        this.errorMessage = 'Failed to save customized voice.';
      },
    });
  }

  deleteCustomVoice(): void {
    if (!this.selectedVoice?.isCustom || this.deleting) {
      return;
    }
    this.deleting = true;
    this.errorMessage = '';
    const id = this.selectedVoice.voiceId;
    this.customVoicesService.delete(id).subscribe({
      next: () => {
        this.deleting = false;
        this.statusMessage = 'Custom voice deleted';
        this.voiceSelector?.reloadVoices(true);
        this.selectedVoice = null;
        this.tweaks = { ...DEFAULT_VOICE_TWEAKS };
        this.customName = '';
      },
      error: (error) => {
        console.error('Failed to delete custom voice', error);
        this.deleting = false;
        this.errorMessage = 'Failed to delete customized voice.';
      },
    });
  }
}
