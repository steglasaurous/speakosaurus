import { Controller, Get, Sse } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, from, merge } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { StreamerBotManagerService } from '../services/streamer-bot-manager.service';
import { AudioProcessorService } from '../services/audio-processor.service';
import { VoiceProviderService } from '../services/voice-providers/voice-provider.service';
import { SettingsService, Setting } from '../services/settings.service';
import { StatusEventService } from '../services/status-event.service';

export interface StatusResponse {
  streamerBotConnected: boolean;
  audioQueueSize: number;
  pendingMessages: number;
  mode: string;
}

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(
    private readonly streamerBotManagerService: StreamerBotManagerService,
    private readonly audioProcessorService: AudioProcessorService,
    private readonly voiceProviderService: VoiceProviderService,
    private readonly settingsService: SettingsService,
    private readonly statusEventService: StatusEventService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get application status',
    description: 'Returns the current status including connection state, queue sizes, and mode',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
  })
  async getStatus(): Promise<StatusResponse> {
    const streamerBotConnected = this.streamerBotManagerService.getConnectionStatus();
    const audioQueueSize = this.audioProcessorService.getQueueSize();
    const pendingMessages = this.voiceProviderService.getPendingMessagesCount();
    
    const modeSetting = await this.settingsService.getSetting(Setting.MODE);
    const mode = modeSetting?.value || modeSetting?.default || 'trigger';

    return {
      streamerBotConnected,
      audioQueueSize,
      pendingMessages,
      mode,
    };
  }

  @Get('stream')
  @Sse('status-stream')
  @ApiOperation({
    summary: 'Stream status updates via Server-Sent Events',
    description: 'Returns a stream of status updates. Sends initial status immediately, then updates when status changes.',
  })
  streamStatus(): Observable<{ data: StatusResponse }> {
    // Get initial status
    const getCurrentStatus = async (): Promise<StatusResponse> => {
      const streamerBotConnected = this.streamerBotManagerService.getConnectionStatus();
      const audioQueueSize = this.audioProcessorService.getQueueSize();
      const pendingMessages = this.voiceProviderService.getPendingMessagesCount();
      const modeSetting = await this.settingsService.getSetting(Setting.MODE);
      const mode = modeSetting?.value || modeSetting?.default || 'trigger';

      return {
        streamerBotConnected,
        audioQueueSize,
        pendingMessages,
        mode,
      };
    };

    // Create observable from status event service
    const statusUpdates$ = this.statusEventService.statusUpdates$.pipe(
      mergeMap(async (partialUpdate) => {
        // Get current status and merge with partial update
        // The partial update values should override current status
        const currentStatus = await getCurrentStatus();
        const mergedStatus = { ...currentStatus, ...partialUpdate };
        return mergedStatus;
      }),
    );

    // Send initial status immediately
    const initialStatus$ = from(getCurrentStatus());

    // Merge initial status with updates
    return merge(
      initialStatus$.pipe(map((status) => ({ data: status }))),
      statusUpdates$.pipe(map((status) => ({ data: status })))
    );
  }
}

