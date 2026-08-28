import { Voice } from '../services/voice-providers/voice.interface';
import { VoiceDto } from './voice.dto';

export function toVoiceDto(voice: Voice): VoiceDto {
  return {
    voiceId: voice.voiceId,
    providerName: voice.providerName,
    voiceName: voice.voiceName,
    displayName: voice.displayName,
    group: voice.group,
    previewUrl: voice.previewUrl,
    language: voice.language,
    gender: voice.gender,
    description: voice.description,
    locale: voice.locale,
    supportedStyles: voice.supportedStyles,
    isCustom: voice.isCustom,
    baseVoiceId: voice.baseVoiceId,
    tweaks: voice.tweaks,
    needsDownload: voice.needsDownload,
    catalogSource: voice.catalogSource,
  };
}
