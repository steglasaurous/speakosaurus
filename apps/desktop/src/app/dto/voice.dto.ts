import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceTweaksDto } from './voice-tweaks.dto';

export class VoiceDto {
  @ApiProperty({
    description: 'Unique identifier for the voice',
    example: 'voice-123',
  })
  voiceId: string;

  @ApiProperty({
    description: 'Name of the voice provider',
    example: 'elevenlabs',
  })
  providerName: string;

  @ApiProperty({
    description: 'Name of the voice',
    example: 'Rachel',
  })
  voiceName: string;

  @ApiPropertyOptional({
    description: 'Display name for the voice',
    example: 'Rachel - Professional',
  })
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Group or category the voice belongs to',
    example: 'Professional',
  })
  group?: string;

  @ApiPropertyOptional({
    description: 'URL to a preview audio sample of the voice',
    example: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/9BWtsMINqrJLrRacOk9x/405766b8-1f4e-4d3c-aba1-6f25333823ec.mp3',
  })
  previewUrl?: string;

  @ApiPropertyOptional({
    description: '2-character language code',
    example: 'en',
  })
  language?: string;

  @ApiPropertyOptional({
    description: 'Voice gender',
    example: 'female',
  })
  gender?: string;

  @ApiPropertyOptional({
    description: 'Description of the voice, if available',
    example: 'A calm conversational voice',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Locale in ISO format',
    example: 'en-US',
  })
  locale?: string;

  @ApiPropertyOptional({
    description: 'Azure speaking styles supported by this voice',
    example: ['cheerful', 'sad'],
  })
  supportedStyles?: string[];

  @ApiPropertyOptional({ description: 'True when this is a user-saved customized voice' })
  isCustom?: boolean;

  @ApiPropertyOptional({ description: 'Stock voice id this custom voice is based on' })
  baseVoiceId?: string;

  @ApiPropertyOptional({ type: VoiceTweaksDto })
  tweaks?: VoiceTweaksDto;
}

