import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { BridgeClientService } from '../services/bridge-client.service';
import { SettingsService, Setting } from '../services/settings.service';
import { TwitchAuthService } from '../services/twitch-auth.service';

class EnableRemoteAccessDto {
  bridgeUrl?: string;
}

@ApiTags('remote-access')
@Controller('remote-access')
export class RemoteAccessController {
  constructor(
    private readonly bridgeClient: BridgeClientService,
    private readonly settingsService: SettingsService,
    private readonly twitchAuth: TwitchAuthService,
    private readonly httpService: HttpService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get remote access status' })
  async getStatus() {
    const enabled =
      (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_ENABLED))?.value === 'true';
    const bridgeUrl =
      (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_BRIDGE_URL))?.value || '';
    const sessionId =
      (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_SESSION_ID))?.value || null;
    return {
      enabled,
      connected: this.bridgeClient.isBridgeConnected(),
      bridgeUrl,
      sessionId: sessionId || this.bridgeClient.getSessionId(),
    };
  }

  @Post('enable')
  @ApiOperation({ summary: 'Enable remote access and connect to bridge' })
  async enable(@Body() body: EnableRemoteAccessDto) {
    try {
      const tokens = await this.twitchAuth.getTokensForRemoteAccess();
      if (!tokens) {
        throw new HttpException(
          'Authenticate with Twitch first (requires moderation:read scope)',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!tokens.scope.includes('moderation:read')) {
        throw new HttpException(
          'Twitch login is missing moderation:read. Re-authenticate with Twitch to enable remote access.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const me = await this.twitchAuth.getAuthenticatedUser();
      if (!me) {
        throw new HttpException(
          'Unable to resolve authenticated Twitch user',
          HttpStatus.BAD_REQUEST,
        );
      }

      const bridgeUrlSetting = await this.settingsService.getSetting(
        Setting.REMOTE_ACCESS_BRIDGE_URL,
      );
      const bridgeUrl = (
        body.bridgeUrl ||
        bridgeUrlSetting?.value ||
        bridgeUrlSetting?.default ||
        ''
      ).replace(/\/$/, '');
      if (!bridgeUrl) {
        throw new HttpException('Bridge URL is required', HttpStatus.BAD_REQUEST);
      }

      const response = await firstValueFrom(
        this.httpService.post(`${bridgeUrl}/api/broadcaster/session`, {
          broadcasterTwitchId: me.id,
          broadcasterTwitchUsername: me.login,
          twitchAccessToken: tokens.accessToken,
          twitchRefreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        }),
      );

      const session = response.data as {
        sessionId: string;
        connectionToken: string;
        expiresAt: string;
      };

      await this.settingsService.setSetting(Setting.REMOTE_ACCESS_BRIDGE_URL, bridgeUrl);
      await this.settingsService.setSetting(Setting.REMOTE_ACCESS_SESSION_ID, session.sessionId);
      await this.settingsService.setSetting(
        Setting.REMOTE_ACCESS_CONNECTION_TOKEN,
        session.connectionToken,
      );
      await this.settingsService.setSetting(Setting.REMOTE_ACCESS_ENABLED, 'true');

      await this.bridgeClient.connect(bridgeUrl, session.sessionId, session.connectionToken);

      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        bridgeUrl,
        connected: true,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Failed to enable remote access');
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('disable')
  @ApiOperation({ summary: 'Disable remote access' })
  async disable() {
    const bridgeUrl = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_BRIDGE_URL))
      ?.value;
    const sessionId = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_SESSION_ID))
      ?.value;

    if (bridgeUrl && sessionId) {
      try {
        await axios.delete(`${bridgeUrl.replace(/\/$/, '')}/api/broadcaster/session/${sessionId}`);
      } catch {
        // Continue local cleanup even if bridge is unreachable.
      }
    }

    await this.bridgeClient.disconnect();
    await this.settingsService.setSetting(Setting.REMOTE_ACCESS_ENABLED, 'false');
    await this.settingsService.setSetting(Setting.REMOTE_ACCESS_SESSION_ID, '');
    await this.settingsService.setSetting(Setting.REMOTE_ACCESS_CONNECTION_TOKEN, '');

    return { success: true, connected: false };
  }

  @Post('reconnect')
  @ApiOperation({ summary: 'Reconnect to an existing remote-access session' })
  async reconnect() {
    const enabled =
      (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_ENABLED))?.value === 'true';
    if (!enabled) {
      return { success: false, message: 'Remote access is not enabled' };
    }

    const bridgeUrl = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_BRIDGE_URL))
      ?.value;
    const sessionId = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_SESSION_ID))
      ?.value;
    const connectionToken = (
      await this.settingsService.getSetting(Setting.REMOTE_ACCESS_CONNECTION_TOKEN)
    )?.value;

    if (!bridgeUrl || !sessionId || !connectionToken) {
      throw new HttpException(
        'Missing stored remote-access connection details',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.bridgeClient.connect(bridgeUrl, sessionId, connectionToken);
    return { success: true, connected: true, sessionId };
  }
}
