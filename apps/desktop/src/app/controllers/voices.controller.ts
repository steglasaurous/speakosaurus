import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { VoiceDto } from '../dto/voice.dto';

@ApiTags('voices')
@Controller('voices')
export class VoicesController {
  constructor(
    private readonly voiceProviderService: VoiceProviderService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get all available voices',
    description: 'Returns an array of all available voices from all configured voice providers',
  })
  @ApiQuery({
    name: 'forceReload',
    required: false,
    type: Boolean,
    description: 'Force reload voices from API, bypassing cache',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of voices',
    type: [VoiceDto],
  })
  async getVoices(@Query('forceReload') forceReload?: string): Promise<VoiceDto[]> {
    const shouldForceReload = forceReload === 'true' || forceReload === '1';
    const voices = await this.voiceProviderService.getVoices(shouldForceReload);
    return voices.map(voice => ({
      voiceId: voice.voiceId,
      providerName: voice.providerName,
      voiceName: voice.voiceName,
      displayName: voice.displayName,
      group: voice.group,
      previewUrl: voice.previewUrl,
    }));
  }
}

