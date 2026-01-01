import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { SpeakDto } from '../dto/speak.dto';
import { AudioProcessorService } from '../services/audio-processor.service';

@ApiTags('speak')
@Controller('speak')
export class SpeakController {
  constructor(
    private readonly voiceProviderService: VoiceProviderService,
    private readonly audioProcessorService: AudioProcessorService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Convert text to speech and queue for playback',
    description: 'Takes a voice ID and message, converts it to speech using the appropriate voice provider, and queues it for audio playback',
  })
  @ApiResponse({
    status: 200,
    description: 'Message successfully queued for playback',
  })
  @ApiResponse({
    status: 404,
    description: 'Voice not found',
  })
  async speak(@Body() speakDto: SpeakDto): Promise<{ success: boolean; message: string }> {
    try {
      // Get the voice
      const voice = await this.voiceProviderService.getVoice(
        speakDto.voiceId,
        speakDto.voiceProvider,
      );

      if (!voice) {
        throw new NotFoundException(
          `Voice with ID '${speakDto.voiceId}' not found in provider '${speakDto.voiceProvider}'`,
        );
      }

      // Get the rendered audio message
      const audioData = await this.voiceProviderService.getRenderedMessage(
        voice,
        speakDto.message,
      );

      // Add to playback queue
      await this.audioProcessorService.addToQueue(audioData);

      return {
        success: true,
        message: 'Message queued for playback',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}

