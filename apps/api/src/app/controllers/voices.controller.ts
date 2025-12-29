import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of voices',
    type: [VoiceDto],
  })
  async getVoices(): Promise<VoiceDto[]> {
    const voices = await this.voiceProviderService.getVoices();
    return voices.map(voice => ({
      voiceId: voice.voiceId,
      providerName: voice.providerName,
      voiceName: voice.voiceName,
      displayName: voice.displayName,
      group: voice.group,
    }));
  }
}

