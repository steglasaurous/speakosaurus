import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionManagerService } from '../services/session-manager.service';
import { TwitchAuthService } from '../services/twitch-auth.service';
import { BroadcasterGateway } from '../gateways/broadcaster.gateway';
import { CreateSessionDto, SessionDto } from '../dto/session.dto';

@ApiTags('broadcaster')
@Controller('broadcaster')
export class BroadcasterController {
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly twitchAuth: TwitchAuthService,
    private readonly broadcasterGateway: BroadcasterGateway,
  ) {}

  @Post('session')
  @ApiOperation({ summary: 'Create a broadcaster remote-access session' })
  @ApiResponse({ status: 201, type: SessionDto })
  async createSession(@Body() dto: CreateSessionDto): Promise<SessionDto> {
    const tokenValidation = await this.twitchAuth.validateToken(dto.twitchAccessToken);
    if (tokenValidation.user_id !== dto.broadcasterTwitchId) {
      throw new UnauthorizedException('Token does not match broadcaster ID');
    }

    if (!tokenValidation.scopes?.includes('moderation:read')) {
      throw new UnauthorizedException(
        'Twitch token is missing moderation:read scope required for remote access',
      );
    }

    const session = await this.sessionManager.createSession({
      broadcasterTwitchId: dto.broadcasterTwitchId,
      broadcasterTwitchUsername: dto.broadcasterTwitchUsername,
      twitchAccessToken: dto.twitchAccessToken,
      twitchRefreshToken: dto.twitchRefreshToken,
      tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : undefined,
    });

    return {
      sessionId: session.sessionId,
      broadcasterTwitchId: session.broadcasterTwitchId,
      broadcasterTwitchUsername: session.broadcasterTwitchUsername,
      connectionToken: session.connectionToken,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isActive: session.isActive,
    };
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string): Promise<Partial<SessionDto>> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    return {
      sessionId: session.sessionId,
      broadcasterTwitchId: session.broadcasterTwitchId,
      broadcasterTwitchUsername: session.broadcasterTwitchUsername,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isActive: session.isActive,
    };
  }

  @Delete('session/:sessionId')
  async deactivateSession(
    @Param('sessionId') sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.sessionManager.deactivateSession(sessionId);
    return { success: true, message: 'Session deactivated successfully' };
  }

  @Get('session/:sessionId/connected')
  async isConnected(
    @Param('sessionId') sessionId: string,
  ): Promise<{ connected: boolean }> {
    const session = this.sessionManager.getSession(sessionId);
    return { connected: !!session?.socket };
  }
}
