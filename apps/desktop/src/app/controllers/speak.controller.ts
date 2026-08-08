import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { SpeakDto } from '../dto/speak.dto';
import { PreviewDto } from '../dto/preview.dto';
import { AudioProcessorService } from '../services/audio-processor.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuid } from 'uuid';
import { AudioData } from '../services/voice-providers/audio-data.interface';

@ApiTags('speak')
@Controller('speak')
export class SpeakController {
  constructor(
    private readonly voiceProviderService: VoiceProviderService,
    private readonly audioProcessorService: AudioProcessorService,
    private readonly httpService: HttpService,
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
      const stopEpochAtRequestStart = this.audioProcessorService.getStopEpoch();
      let voice;

      // If voice parameters are provided, use them; otherwise fall back to default voice
      if (speakDto.voiceId && speakDto.voiceProvider) {
        voice = await this.voiceProviderService.getVoice(
          speakDto.voiceId,
          speakDto.voiceProvider,
        );

        if (!voice) {
          throw new NotFoundException(
            `Voice with ID '${speakDto.voiceId}' not found in provider '${speakDto.voiceProvider}'`,
          );
        }
      } else {
        // Prefer a configured pronoun-specific default, then use the global default.
        voice = await this.voiceProviderService.getPronounDefaultVoice(
          speakDto.pronouns,
        );
        if (!voice) {
          voice = await this.voiceProviderService.getDefaultVoice();
        }
      }

      // Get the rendered audio message
      const audioData = await this.voiceProviderService.getRenderedMessage(
        voice,
        speakDto.message,
      );

      // If Stop was triggered while the provider was rendering/downloading,
      // discard the result instead of enqueuing it for playback.
      if (stopEpochAtRequestStart !== this.audioProcessorService.getStopEpoch()) {
        try {
          unlinkSync(audioData.audioFilePath);
        } catch {
          // Best-effort cleanup; ignore if temp file already went away.
        }
        return {
          success: false,
          message: 'Speech render discarded due to stop',
        };
      }

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

  @Post('preview')
  @ApiOperation({
    summary: 'Play voice preview audio',
    description: 'Plays a preview of a voice. If previewUrl is provided, downloads and plays that audio file. Otherwise, generates TTS with a test message.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preview successfully queued for playback',
  })
  @ApiResponse({
    status: 404,
    description: 'Voice not found',
  })
  async preview(@Body() previewDto: PreviewDto): Promise<{ success: boolean; message: string }> {
    try {
      const stopEpochAtRequestStart = this.audioProcessorService.getStopEpoch();
      // Get the voice
      const voice = await this.voiceProviderService.getVoice(
        previewDto.voiceId,
        previewDto.voiceProvider,
      );

      if (!voice) {
        throw new NotFoundException(
          `Voice with ID '${previewDto.voiceId}' not found in provider '${previewDto.voiceProvider}'`,
        );
      }

      let audioData: AudioData;

      if (previewDto.previewUrl) {
        // Download the preview audio file from URL
        try {
          const audioResponse = await firstValueFrom(
            this.httpService.get<ArrayBuffer>(previewDto.previewUrl, {
              responseType: 'arraybuffer',
            }),
          );

          // Determine file extension from URL or content type
          const url = new URL(previewDto.previewUrl);
          const pathname = url.pathname.toLowerCase();
          let extension = '.mp3'; // default
          if (pathname.endsWith('.wav')) {
            extension = '.wav';
          } else if (pathname.endsWith('.mp3')) {
            extension = '.mp3';
          } else if (pathname.endsWith('.m4a')) {
            extension = '.m4a';
          }

          // Save to temporary file
          const audioBuffer = Buffer.from(audioResponse.data);
          const fileName = `${uuid()}${extension}`;
          const tempFilePath = join(tmpdir(), fileName);
          writeFileSync(tempFilePath, audioBuffer);

          audioData = {
            message: 'Voice preview',
            voice,
            audioFilePath: tempFilePath,
          };
        } catch (downloadError) {
          throw new Error(`Failed to download preview audio: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`);
        }
      } else {
        // Generate TTS with test message
        audioData = await this.voiceProviderService.getRenderedMessage(
          voice,
          'This is a test message.',
        );
      }

      // If Stop was triggered while the preview audio was rendering/downloading,
      // discard it instead of enqueuing it for playback.
      if (stopEpochAtRequestStart !== this.audioProcessorService.getStopEpoch()) {
        try {
          unlinkSync(audioData.audioFilePath);
        } catch {
          // Best-effort cleanup; ignore if temp file already went away.
        }
        return {
          success: false,
          message: 'Preview render discarded due to stop',
        };
      }

      // Add to playback queue
      await this.audioProcessorService.addToQueue(audioData);

      return {
        success: true,
        message: 'Preview queued for playback',
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Post('stop')
  @ApiOperation({
    summary: 'Stop all speech and clear pending queue',
    description: 'Stops the renderer currently playing audio immediately and clears any queued speech items.',
  })
  @ApiResponse({
    status: 200,
    description: 'Speech playback stopped and queue cleared',
  })
  async stopAllSpeech(): Promise<{ success: boolean; queueSize: number; message: string }> {
    const result = this.audioProcessorService.stopAll();
    return {
      success: result.success,
      queueSize: result.queueSize,
      message: 'Stopped playback and cleared pending queue',
    };
  }
}

