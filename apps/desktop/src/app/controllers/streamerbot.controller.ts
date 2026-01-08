import {
  Controller,
  Get,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StreamerBotManagerService } from '../services/streamer-bot-manager.service';
import { GetActionsResponse } from '@streamerbot/client';

@ApiTags('streamerbot')
@Controller('streamerbot')
export class StreamerBotController {
  constructor(
    private readonly streamerBotManagerService: StreamerBotManagerService,
  ) {}

  @Get('actions')
  @ApiOperation({
    summary: 'Get all StreamerBot actions',
    description: 'Returns a list of all available StreamerBot actions',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of actions',
  })
  @ApiResponse({
    status: 503,
    description: 'StreamerBot service not connected',
  })
  async getActions(): Promise<GetActionsResponse | null> {
    return await this.streamerBotManagerService.getActions();
  }
}

