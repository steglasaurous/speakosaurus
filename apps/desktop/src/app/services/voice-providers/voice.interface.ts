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
}
