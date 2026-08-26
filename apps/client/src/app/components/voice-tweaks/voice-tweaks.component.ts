import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_VOICE_TWEAKS,
  VoiceTweakSettings,
} from '../../services/voices.service';

@Component({
  selector: 'app-voice-tweaks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './voice-tweaks.component.html',
  styleUrl: './voice-tweaks.component.scss',
})
export class VoiceTweaksComponent {
  @Input() providerName: string | null = null;
  @Input() supportedStyles: string[] = [];
  @Input() tweaks: VoiceTweakSettings = { ...DEFAULT_VOICE_TWEAKS };
  @Output() tweaksChange = new EventEmitter<VoiceTweakSettings>();

  get showSpeed(): boolean {
    return this.providerName != null && this.providerName !== 'ttsMonster' && this.providerName !== 'ttsMonsterUnofficial';
  }

  get showPitch(): boolean {
    return this.providerName === 'azure';
  }

  get showVolume(): boolean {
    return !!this.providerName;
  }

  get showAzureStyle(): boolean {
    return this.providerName === 'azure' && this.supportedStyles.length > 0;
  }

  get showAzureStyleDegree(): boolean {
    return this.showAzureStyle && !!this.tweaks.azureStyle;
  }

  get showElevenLabs(): boolean {
    return this.providerName === 'elevenlabs';
  }

  get showPiper(): boolean {
    return this.providerName === 'piper';
  }

  get showMonsterHint(): boolean {
    return this.providerName === 'ttsMonster' || this.providerName === 'ttsMonsterUnofficial';
  }

  patch(partial: Partial<VoiceTweakSettings>): void {
    this.tweaks = { ...this.tweaks, ...partial };
    this.tweaksChange.emit(this.tweaks);
  }

  patchNumber(field: keyof VoiceTweakSettings, value: string | number): void {
    this.patch({ [field]: Number(value) } as Partial<VoiceTweakSettings>);
  }

  formatMultiplier(value: number | undefined, fallback = 1): string {
    return `${(value ?? fallback).toFixed(2)}×`;
  }

  formatPercent(value: number | undefined, fallback = 1): string {
    return `${Math.round((value ?? fallback) * 100)}%`;
  }

  formatFixed(value: number | undefined, fallback = 0): string {
    return (value ?? fallback).toFixed(2);
  }
}
