import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: 'URL to preview audio file. If not provided, will generate TTS with test message.',
    example: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/9BWtsMINqrJLrRacOk9x/405766b8-1f4e-4d3c-aba1-6f25333823ec.mp3',
  })
  previewUrl?: string;
}

