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
import { RenderTimingService } from '../services/render-timing.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly voiceProviderService: VoiceProviderService,
    private readonly streamerBotManagerService: StreamerBotManagerService,
    private readonly renderTimingService: RenderTimingService,
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
    await this.refreshVoiceProvidersForSetting(createSettingDto.name);
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

    await this.refreshVoiceProvidersForSetting(name);
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
    await this.refreshVoiceProvidersForSetting(name);

    return {
      success: true,
      message: `Setting '${name}' successfully deleted`,
    };
  }

  private async refreshVoiceProvidersForSetting(name: string): Promise<void> {
    switch (name) {
      case Setting.ELEVENLABS_API_KEY:
      case Setting.ELEVENLABS_ENABLED:
        await this.voiceProviderService.updateElevenLabsProvider();
        break;
      case Setting.TTS_MONSTER_API_KEY:
      case Setting.TTS_MONSTER_ENABLED:
        await this.voiceProviderService.updateTTSMonsterProvider();
        break;
      case Setting.TTS_MONSTER_UNOFFICIAL_USER_ID:
      case Setting.TTS_MONSTER_UNOFFICIAL_API_KEY:
      case Setting.TTS_MONSTER_UNOFFICIAL_ENABLED:
        await this.voiceProviderService.updateTTSMonsterUnofficialProvider();
        break;
      case Setting.AZURE_SPEECH_KEY:
      case Setting.AZURE_SPEECH_REGION:
      case Setting.AZURE_ENDPOINT:
      case Setting.AZURE_ENABLED:
        await this.voiceProviderService.updateAzureProvider();
        break;
      case Setting.PIPER_HTTP_URL:
      case Setting.PIPER_USE_BUILT_IN:
      case Setting.PIPER_ENABLED:
      case Setting.PIPER_CPU_THREADS:
        await this.voiceProviderService.updatePiperProvider();
        break;
      case Setting.STREAMERBOT_WEBSOCKET_URL:
        await this.streamerBotManagerService.updateStreamerBotService();
        break;
      case Setting.LOG_RENDER_TIMING:
        await this.renderTimingService.refreshEnabled();
        break;
    }
  }
}

