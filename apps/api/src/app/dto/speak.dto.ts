import { ApiProperty } from '@nestjs/swagger';

export class SpeakDto {
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

  @ApiProperty({
    description: 'The message text to be converted to speech',
    example: 'Hello, this is a test message.',
  })
  message: string;
}

