import { ApiProperty } from '@nestjs/swagger';

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
    description: 'The message text to be converted to speech',
    example: 'Hello, this is a test message.',
  })
  message: string;
}

