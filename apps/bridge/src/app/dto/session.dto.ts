import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty()
  broadcasterTwitchId!: string;

  @ApiProperty()
  broadcasterTwitchUsername!: string;

  @ApiProperty()
  twitchAccessToken!: string;

  @ApiPropertyOptional()
  twitchRefreshToken?: string;

  @ApiPropertyOptional()
  tokenExpiresAt?: string;
}

export class SessionDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  broadcasterTwitchId!: string;

  @ApiProperty()
  broadcasterTwitchUsername!: string;

  @ApiProperty()
  connectionToken!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  isActive!: boolean;
}

export class ModeratorAuthDto {
  @ApiProperty()
  twitchAccessToken!: string;

  @ApiProperty()
  broadcasterUsername!: string;
}

export class ModeratorAuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  broadcasterUsername!: string;

  @ApiProperty()
  bridgeUrl!: string;

  @ApiProperty()
  modTwitchUsername!: string;
}

export class OAuthExchangeDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  redirectUri!: string;
}
