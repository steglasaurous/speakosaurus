import { VoiceTweakSettings } from './voice-tweak-settings.interface';

export interface Voice {
  voiceId: string;
  providerName: string;
  voiceName: string;
  displayName?: string;
  group?: string;
  previewUrl?: string;
  /** 2-character language code (e.g. en) */
  language?: string;
  /** male, female, other */
  gender?: string;
  /** Description of the voice, if available */
  description?: string;
  /** Locale in ISO format (e.g. en-US, es-ES) */
  locale?: string;
  /** Azure neural styles this stock voice supports. */
  supportedStyles?: string[];
  isCustom?: boolean;
  baseVoiceId?: string;
  tweaks?: VoiceTweakSettings;
}
