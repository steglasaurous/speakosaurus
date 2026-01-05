import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSettingDto, SettingDto, UpdateSettingDto } from '../dto/setting.dto';
import { SettingsService, Setting } from '../services/settings.service';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { StreamerBotManagerService } from '../services/streamer-bot-manager.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly voiceProviderService: VoiceProviderService,
    private readonly streamerBotManagerService: StreamerBotManagerService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get all settings',
    description: 'Returns an array of all settings in the database',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of settings',
    type: [SettingDto],
  })
  async getAllSettings(): Promise<SettingDto[]> {
    return this.settingsService.getAllSettings();
  }

  @Get(':name')
  @ApiOperation({
    summary: 'Get a setting by name',
    description: 'Returns a single setting identified by its name',
  })
  @ApiParam({
    name: 'name',
    description: 'Name of the setting to retrieve',
    example: 'theme',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the setting',
    type: SettingDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Setting not found',
  })
  async getSetting(@Param('name') name: string): Promise<SettingDto> {
    return this.settingsService.getSetting(name);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or update a setting',
    description: 'Creates a new setting or updates an existing one with the provided name and value',
  })
  @ApiResponse({
    status: 201,
    description: 'Setting successfully created or updated',
    type: SettingDto,
  })
  async createSetting(@Body() createSettingDto: CreateSettingDto): Promise<SettingDto> {
    const result = await this.settingsService.setSetting(
      createSettingDto.name,
      createSettingDto.value,
    );
    
    // If ElevenLabs API key was updated, update the voice provider
    if (createSettingDto.name === Setting.ELEVENLABS_API_KEY) {
      await this.voiceProviderService.updateElevenLabsProvider();
    }
    
    // If StreamerBot WebSocket URL was updated, reconnect the service
    if (createSettingDto.name === Setting.STREAMERBOT_WEBSOCKET_URL) {
      await this.streamerBotManagerService.updateStreamerBotService();
    }
    
    return result;
  }

  @Put(':name')
  @ApiOperation({
    summary: 'Create or update a setting',
    description: 'Creates a new setting or updates an existing one identified by name',
  })
  @ApiParam({
    name: 'name',
    description: 'Name of the setting to create or update',
    example: 'theme',
  })
  @ApiResponse({
    status: 200,
    description: 'Setting successfully created or updated',
    type: SettingDto,
  })
  async updateSetting(
    @Param('name') name: string,
    @Body() updateSettingDto: UpdateSettingDto,
  ): Promise<SettingDto> {
    let result: SettingDto;
    
    if (!updateSettingDto.value) {
      // If no value provided, get existing setting to preserve current value
      const existing = await this.settingsService.getSetting(name);
      result = await this.settingsService.setSetting(name, existing.value);
    } else {
      result = await this.settingsService.setSetting(name, updateSettingDto.value);
    }

    // If ElevenLabs API key was updated, update the voice provider
    if (name === Setting.ELEVENLABS_API_KEY) {
      await this.voiceProviderService.updateElevenLabsProvider();
    }

    // If StreamerBot WebSocket URL was updated, reconnect the service
    if (name === Setting.STREAMERBOT_WEBSOCKET_URL) {
      await this.streamerBotManagerService.updateStreamerBotService();
    }

    return result;
  }

  @Delete(':name')
  @ApiOperation({
    summary: 'Delete a setting',
    description: 'Deletes a setting identified by name',
  })
  @ApiParam({
    name: 'name',
    description: 'Name of the setting to delete',
    example: 'theme',
  })
  @ApiResponse({
    status: 200,
    description: 'Setting successfully deleted',
  })
  @ApiResponse({
    status: 404,
    description: 'Setting not found',
  })
  async deleteSetting(@Param('name') name: string): Promise<{ success: boolean; message: string }> {
    await this.settingsService.deleteSetting(name);

    // If ElevenLabs API key was deleted, update the voice provider
    if (name === Setting.ELEVENLABS_API_KEY) {
      await this.voiceProviderService.updateElevenLabsProvider();
    }

    // If StreamerBot WebSocket URL was deleted, reconnect the service (will use default)
    if (name === Setting.STREAMERBOT_WEBSOCKET_URL) {
      await this.streamerBotManagerService.updateStreamerBotService();
    }

    return {
      success: true,
      message: `Setting '${name}' successfully deleted`,
    };
  }
}

