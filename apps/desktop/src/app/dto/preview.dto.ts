import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VoiceTweaksDto } from './voice-tweaks.dto';

export class PreviewDto {
  @ApiProperty({
    description: 'Name of the voice provider',
    example: 'elevenlabs',
  })
  voiceProvider: string;

  @ApiProperty({
    description: 'Unique identifier for the voice to use',
    example: 'JBFqnCBsd6RMkjVDRZzb',
  })
  voiceId: string;

  @ApiPropertyOptional({
    description: 'URL to preview audio file. Ignored when message or tweaks are provided.',
    example: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/9BWtsMINqrJLrRacOk9x/405766b8-1f4e-4d3c-aba1-6f25333823ec.mp3',
  })
  previewUrl?: string;

  @ApiPropertyOptional({
    description: 'Text to synthesize instead of the default test message.',
  })
  message?: string;

  @ApiPropertyOptional({
    description: 'Live tweak overrides for this preview. When set, previewUrl is ignored.',
    type: VoiceTweaksDto,
  })
  tweaks?: VoiceTweaksDto;
}
