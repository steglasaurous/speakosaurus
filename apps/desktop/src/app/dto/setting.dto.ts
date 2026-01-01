import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SettingDto {
  @ApiProperty({
    description: 'Name of the setting',
    example: 'theme',
  })
  name: string;

  @ApiProperty({
    description: 'Value of the setting',
    example: 'dark',
  })
  value: string;
}

export class CreateSettingDto {
  @ApiProperty({
    description: 'Name of the setting',
    example: 'theme',
  })
  name: string;

  @ApiProperty({
    description: 'Value of the setting',
    example: 'dark',
  })
  value: string;
}

export class UpdateSettingDto {
  @ApiPropertyOptional({
    description: 'Value of the setting',
    example: 'light',
  })
  value?: string;
}

