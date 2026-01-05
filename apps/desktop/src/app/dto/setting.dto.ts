import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Setting, SettingDefinition, SettingType } from '../services/settings.service';

export class SettingDto implements SettingDefinition {
  
  @ApiProperty({
    description: 'Display name of the setting',
    example: 'Theme',
  })
  displayName: string;

  @ApiProperty({
    description: 'Group of the setting',
    example: 'General',
  })
  group: string;

  @ApiProperty({
    description: 'Description of the setting',
    example: 'The theme of the application',
  })
  description: string;

  @ApiProperty({
    description: 'Type of the setting',
    example: 'string',
  })
  type: SettingType;

  @ApiPropertyOptional({
    description: 'Default value of the setting',
    example: 'dark',
  })
  default?: string;

  @ApiPropertyOptional({
    description: 'Options of the setting',
    example: ['dark', 'light'],
  })
  options?: string[];

  @ApiPropertyOptional({
    description: 'Required of the setting',
    example: true,
  })
  required?: boolean;

  @ApiProperty({
    description: 'Name of the setting',
    example: 'theme',
  })
  name: Setting;

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

