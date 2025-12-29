import { Controller, Get } from '@nestjs/common';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';

@Controller()
export class AppController {
  constructor(
    private readonly voiceProviderService: VoiceProviderService) {}

  @Get()
  async getData() {
    return JSON.stringify(await this.voiceProviderService.getVoices());
  }
}
