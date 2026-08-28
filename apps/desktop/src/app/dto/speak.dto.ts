import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceTweaksDto } from './voice-tweaks.dto';

export class SpeakDto {
  @ApiProperty({
    description: 'Name of the voice provider. If not provided, the default voice will be used.',
    example: 'elevenlabs',
    required: false,
  })
  voiceProvider?: string;

  @ApiProperty({
    description: 'Unique identifier for the voice to use. If not provided, the default voice will be used.',
    example: 'JBFqnCBsd6RMkjVDRZzb',
    required: false,
  })
  voiceId?: string;

  @ApiProperty({
    description: 'Pronouns used to select a configured male or female default voice when no explicit voice is provided.',
    example: 'hehim',
    required: false,
  })
  pronouns?: string;

  @ApiPropertyOptional({
    description: 'Tweak snapshot to apply for this utterance. Overrides the resolved voice tweaks when set.',
    type: VoiceTweaksDto,
  })
  tweaks?: VoiceTweaksDto;

  @ApiProperty({
    description: 'The message text to be converted to speech',
    example: 'Hello, this is a test message.',
  })
  message: string;
}

