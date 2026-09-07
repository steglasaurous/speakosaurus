import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionManagerService } from '../services/session-manager.service';
import { TwitchAuthService } from '../services/twitch-auth.service';
import { AuthenticatedRequest, ModeratorAuthGuard } from '../guards/moderator-auth.guard';
import { BroadcasterGateway } from '../gateways/broadcaster.gateway';
import {
  ModeratorAuthDto,
  ModeratorAuthResponseDto,
  OAuthExchangeDto,
} from '../dto/session.dto';
import { filterSensitiveSettings, isSensitiveSetting } from '../sensitive-settings';

@ApiTags('moderator')
@Controller('moderator')
export class ModeratorController {
  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly twitchAuth: TwitchAuthService,
    private readonly broadcasterGateway: BroadcasterGateway,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Public config for browser remote UI' })
  getConfig() {
    return {
      twitchClientId: this.twitchAuth.getClientId(),
      publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3333}`,
    };
  }

  @Post('oauth/token')
  @ApiOperation({ summary: 'Exchange Twitch auth code for tokens (browser OAuth)' })
  async exchangeOAuth(@Body() dto: OAuthExchangeDto) {
    try {
      const tokens = await this.twitchAuth.exchangeCodeForToken(dto.code, dto.redirectUri);
      const user = await this.twitchAuth.getUserInfo(tokens.access_token);
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        user: {
          id: user.id,
          login: user.login,
          displayName: user.display_name,
        },
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to exchange Twitch auth code',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('authenticate')
  @ApiOperation({ summary: 'Authenticate as mod/broadcaster for a channel session' })
  async authenticate(@Body() authDto: ModeratorAuthDto): Promise<ModeratorAuthResponseDto> {
    const tokenValidation = await this.twitchAuth.validateToken(authDto.twitchAccessToken);
    const modUser = await this.twitchAuth.getUserInfo(
      authDto.twitchAccessToken,
      tokenValidation.user_id,
    );

    let session = this.sessionManager.getSessionByUsername(authDto.broadcasterUsername);
    if (!session) {
      // Resolve via Helix if username casing differs / not indexed yet
      const broadcaster = await this.twitchAuth.getUserByUsername(
        authDto.twitchAccessToken,
        authDto.broadcasterUsername,
      );
      session = this.sessionManager.getSessionByBroadcaster(broadcaster.id);
    }

    if (!session) {
      throw new HttpException(
        'No active remote-access session for this broadcaster',
        HttpStatus.NOT_FOUND,
      );
    }

    const isBroadcaster = session.broadcasterTwitchId === modUser.id;
    if (!isBroadcaster) {
      const broadcasterToken = await this.sessionManager.getBroadcasterAccessToken(
        session.sessionId,
      );
      const isMod = await this.twitchAuth.isUserModeratorOfChannel(
        broadcasterToken,
        session.broadcasterTwitchId,
        modUser.id,
      );
      if (!isMod) {
        throw new UnauthorizedException(
          `User ${modUser.login} is not a moderator of ${session.broadcasterTwitchUsername}`,
        );
      }
    }

    const accessToken = await this.sessionManager.grantModeratorAccess(
      session.sessionId,
      modUser.id,
      modUser.login,
    );

    await this.sessionManager.logAction(
      session.sessionId,
      modUser.id,
      'AUTHENTICATE',
      '/moderator/authenticate',
      true,
    );

    const bridgeUrl =
      process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3333}`;

    return {
      accessToken,
      sessionId: session.sessionId,
      broadcasterUsername: session.broadcasterTwitchUsername,
      bridgeUrl,
      modTwitchUsername: modUser.login,
    };
  }

  @Get('users')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getUsers(@Req() req: AuthenticatedRequest, @Query('query') query?: string) {
    return this.proxyRequest(req, 'GET', '/users', null, query ? { query } : {});
  }

  @Post('users')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  createUser(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.proxyRequest(req, 'POST', '/users', body);
  }

  @Post('users/populate-pronouns')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  populatePronouns(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/users/populate-pronouns');
  }

  @Get('users/:twitchUserId')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getUser(@Req() req: AuthenticatedRequest, @Param('twitchUserId') twitchUserId: string) {
    return this.proxyRequest(req, 'GET', `/users/${twitchUserId}`);
  }

  @Put('users/:twitchUserId')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  updateUser(
    @Req() req: AuthenticatedRequest,
    @Param('twitchUserId') twitchUserId: string,
    @Body() body: unknown,
  ) {
    return this.proxyRequest(req, 'PUT', `/users/${twitchUserId}`, body);
  }

  @Post('users/:twitchUserId/intros')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  addCustomIntro(
    @Req() req: AuthenticatedRequest,
    @Param('twitchUserId') twitchUserId: string,
    @Body() body: unknown,
  ) {
    return this.proxyRequest(req, 'POST', `/users/${twitchUserId}/intros`, body);
  }

  @Put('users/intros/:introId')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  updateCustomIntro(
    @Req() req: AuthenticatedRequest,
    @Param('introId') introId: string,
    @Body() body: unknown,
  ) {
    return this.proxyRequest(req, 'PUT', `/users/intros/${introId}`, body);
  }

  @Delete('users/intros/:introId')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  deleteCustomIntro(@Req() req: AuthenticatedRequest, @Param('introId') introId: string) {
    return this.proxyRequest(req, 'DELETE', `/users/intros/${introId}`);
  }

  @Get('twitch/users/search')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  searchTwitchUsers(@Req() req: AuthenticatedRequest, @Query('query') query?: string) {
    return this.proxyRequest(req, 'GET', '/twitch/users/search', null, query ? { query } : {});
  }

  @Get('twitch/users/by-username')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getTwitchUserByUsername(
    @Req() req: AuthenticatedRequest,
    @Query('username') username?: string,
  ) {
    return this.proxyRequest(
      req,
      'GET',
      '/twitch/users/by-username',
      null,
      username ? { username } : {},
    );
  }

  @Get('settings')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  async getSettings(@Req() req: AuthenticatedRequest) {
    const settings = await this.proxyRequest(req, 'GET', '/settings');
    return filterSensitiveSettings(Array.isArray(settings) ? settings : []);
  }

  @Get('settings/:name')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  async getSetting(@Req() req: AuthenticatedRequest, @Param('name') name: string) {
    if (isSensitiveSetting(name)) {
      throw new HttpException('Cannot view sensitive settings remotely', HttpStatus.FORBIDDEN);
    }
    return this.proxyRequest(req, 'GET', `/settings/${name}`);
  }

  @Put('settings/:name')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  updateSetting(
    @Req() req: AuthenticatedRequest,
    @Param('name') name: string,
    @Body() body: unknown,
  ) {
    if (isSensitiveSetting(name)) {
      throw new HttpException('Cannot modify sensitive settings remotely', HttpStatus.FORBIDDEN);
    }
    return this.proxyRequest(req, 'PUT', `/settings/${name}`, body);
  }

  @Get('voices')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getVoices(@Req() req: AuthenticatedRequest, @Query('forceReload') forceReload?: string) {
    return this.proxyRequest(req, 'GET', '/voices', null, forceReload ? { forceReload } : {});
  }

  @Post('voices/piper/:voiceId/download')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  downloadPiperVoice(@Req() req: AuthenticatedRequest, @Param('voiceId') voiceId: string) {
    return this.proxyRequest(req, 'POST', `/voices/piper/${voiceId}/download`);
  }

  @Get('custom-voices')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getCustomVoices(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'GET', '/custom-voices');
  }

  @Post('custom-voices')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  createCustomVoice(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.proxyRequest(req, 'POST', '/custom-voices', body);
  }

  @Put('custom-voices/:id')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  updateCustomVoice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.proxyRequest(req, 'PUT', `/custom-voices/${id}`, body);
  }

  @Delete('custom-voices/:id')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  deleteCustomVoice(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.proxyRequest(req, 'DELETE', `/custom-voices/${id}`);
  }

  @Post('queue/clear')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  clearQueue(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/queue/clear');
  }

  @Post('queue/skip')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  skipQueue(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/queue/skip');
  }

  @Post('queue/pause')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  pauseQueue(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/queue/pause');
  }

  @Post('queue/resume')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  resumeQueue(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/queue/resume');
  }

  @Get('status')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'GET', '/status');
  }

  @Post('speak/preview')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  previewSpeak(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.proxyRequest(req, 'POST', '/speak/preview', body, undefined, 120000);
  }

  @Post('speak')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  speak(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.proxyRequest(req, 'POST', '/speak', body, undefined, 120000);
  }

  @Post('speak/stop')
  @UseGuards(ModeratorAuthGuard)
  @ApiBearerAuth()
  stopSpeak(@Req() req: AuthenticatedRequest) {
    return this.proxyRequest(req, 'POST', '/speak/stop');
  }

  private async proxyRequest(
    req: AuthenticatedRequest,
    method: string,
    endpoint: string,
    body?: unknown,
    query?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const sessionId = req.moderator!.sessionId;
    try {
      const response = await this.broadcasterGateway.sendCommand(
        sessionId,
        method,
        endpoint,
        body,
        query,
        timeoutMs,
      );
      await this.sessionManager.logAction(
        sessionId,
        req.moderator!.modTwitchId,
        method,
        endpoint,
        true,
      );
      return response.body;
    } catch (error) {
      await this.sessionManager.logAction(
        sessionId,
        req.moderator!.modTwitchId,
        method,
        endpoint,
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw new HttpException(
        error instanceof Error ? error.message : 'Request failed',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
