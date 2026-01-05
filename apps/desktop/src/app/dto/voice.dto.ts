import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

