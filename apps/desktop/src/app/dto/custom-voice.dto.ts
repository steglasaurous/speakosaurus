import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceTweaksDto } from './voice-tweaks.dto';

export class CreateCustomVoiceDto {
  @ApiProperty({ description: 'Display name for the customized voice' })
  displayName: string;

  @ApiProperty({ description: 'Underlying TTS provider name', example: 'azure' })
  providerName: string;

  @ApiProperty({ description: 'Stock voice id to customize' })
  baseVoiceId: string;

  @ApiPropertyOptional({ type: VoiceTweaksDto })
  tweaks?: VoiceTweaksDto;
}

export class UpdateCustomVoiceDto {
  @ApiPropertyOptional({ description: 'Display name for the customized voice' })
  displayName?: string;

  @ApiPropertyOptional({ type: VoiceTweaksDto })
  tweaks?: VoiceTweaksDto;
}

export class CustomVoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  providerName: string;

  @ApiProperty()
  baseVoiceId: string;

  @ApiProperty({ type: VoiceTweaksDto })
  tweaks: VoiceTweaksDto;
}
