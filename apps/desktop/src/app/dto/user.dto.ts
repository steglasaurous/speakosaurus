import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomIntroDto {
  @ApiProperty({
    description: 'Unique identifier for the custom intro',
    example: 'user123-1234567890-abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Twitch user ID this intro belongs to',
    example: '12345678',
  })
  twitchUserId: string;

  @ApiProperty({
    description: 'The intro text',
    example: 'Hey everyone, it\'s Felix here!',
  })
  introText: string;
}

export class UserDto {
  @ApiProperty({
    description: 'Twitch user ID',
    example: '12345678',
  })
  twitchUserId: string;

  @ApiProperty({
    description: 'Twitch username',
    example: 'xQc',
  })
  twitchUsername: string;

  @ApiPropertyOptional({
    description: 'The username that TTS should use when speaking',
    example: 'Felix',
  })
  ttsName?: string;

  @ApiPropertyOptional({
    description: 'Voice provider name',
    example: 'elevenlabs',
  })
  ttsProviderName?: string;

  @ApiPropertyOptional({
    description: 'Voice ID',
    example: 'voice-123',
  })
  ttsVoiceId?: string;

  @ApiPropertyOptional({
    description: 'Whether to disable welcoming this user on first words',
    example: false,
  })
  disableWelcome?: boolean;

  @ApiProperty({
    description: 'Custom intro texts for this user',
    type: [CustomIntroDto],
  })
  customIntros: CustomIntroDto[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'The username that TTS should use when speaking',
    example: 'Felix',
  })
  ttsName?: string;

  @ApiPropertyOptional({
    description: 'Voice provider name',
    example: 'elevenlabs',
  })
  ttsProviderName?: string;

  @ApiPropertyOptional({
    description: 'Voice ID',
    example: 'voice-123',
  })
  ttsVoiceId?: string;

  @ApiPropertyOptional({
    description: 'Whether to disable welcoming this user on first words',
    example: false,
  })
  disableWelcome?: boolean;
}

export class CreateCustomIntroDto {
  @ApiProperty({
    description: 'The intro text',
    example: 'Hey everyone, it\'s Felix here!',
  })
  introText: string;
}

export class UpdateCustomIntroDto {
  @ApiProperty({
    description: 'The intro text',
    example: 'Hey everyone, it\'s Felix here!',
  })
  introText: string;
}

export class CreateUserDto {
  @ApiProperty({
    description: 'Twitch user ID',
    example: '12345678',
  })
  twitchUserId: string;

  @ApiProperty({
    description: 'Twitch username',
    example: 'xQc',
  })
  twitchUsername: string;
}

