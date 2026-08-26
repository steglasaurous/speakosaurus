export interface VoiceTweakSettings {
  /** Speaking speed multiplier. 1 = default. Typical range 0.5–2. */
  speed?: number;
  /** Pitch multiplier. 1 = default. Azure only. Typical range 0.5–1.5. */
  pitch?: number;
  /** Playback gain. 1 = default. Typical range 0–2. */
  volume?: number;
  /** Azure neural speaking style (e.g. cheerful). */
  azureStyle?: string;
  /** Azure style intensity. 0.01–2, default 1. */
  azureStyleDegree?: number;
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsUseSpeakerBoost?: boolean;
  /** Piper noise_scale (expressiveness). */
  piperNoiseScale?: number;
}

export interface CustomVoiceRecord {
  id: string;
  displayName: string;
  providerName: string;
  baseVoiceId: string;
  tweaks: VoiceTweakSettings;
  language?: string;
  gender?: string;
  locale?: string;
  description?: string;
  supportedStyles?: string[];
}
