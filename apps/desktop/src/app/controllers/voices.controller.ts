import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { VoiceDto } from '../dto/voice.dto';
import { toVoiceDto } from '../dto/voice-mapper';

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
    return voices.map(toVoiceDto);
  }

  @Post('piper/:voiceId/download')
  @ApiOperation({
    summary: 'Download a Piper catalog voice',
    description:
      'Downloads the .onnx model and .onnx.json config for a catalog voice into the app voices folder',
  })
  @ApiResponse({
    status: 201,
    description: 'Voice downloaded and ready to use',
    type: VoiceDto,
  })
  async downloadPiperVoice(@Param('voiceId') voiceId: string): Promise<VoiceDto> {
    const voice = await this.voiceProviderService.downloadPiperVoice(voiceId);
    return toVoiceDto(voice);
  }
}
