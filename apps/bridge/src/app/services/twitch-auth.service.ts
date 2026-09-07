import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
}

export interface TwitchTokenValidation {
  client_id: string;
  login: string;
  scopes: string[];
  user_id: string;
  expires_in: number;
}

@Injectable()
export class TwitchAuthService {
  private readonly logger = new Logger(TwitchAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly httpService: HttpService) {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not configured');
    }
  }

  getClientId(): string {
    return this.clientId;
  }

  async validateToken(accessToken: string): Promise<TwitchTokenValidation> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<TwitchTokenValidation>('https://id.twitch.tv/oauth2/validate', {
          headers: { Authorization: `OAuth ${accessToken}` },
        }),
      );
      return response.data;
    } catch {
      throw new UnauthorizedException('Invalid Twitch access token');
    }
  }

  async getUserInfo(accessToken: string, userId?: string): Promise<TwitchUser> {
    const url = userId
      ? `https://api.twitch.tv/helix/users?id=${userId}`
      : 'https://api.twitch.tv/helix/users';
    const response = await firstValueFrom(
      this.httpService.get<{ data: TwitchUser[] }>(url, {
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      }),
    );
    if (!response.data.data?.length) {
      throw new UnauthorizedException('User not found');
    }
    return response.data.data[0];
  }

  async getUserByUsername(accessToken: string, username: string): Promise<TwitchUser> {
    const response = await firstValueFrom(
      this.httpService.get<{ data: TwitchUser[] }>(
        `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`,
        {
          headers: {
            'Client-ID': this.clientId,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      ),
    );
    if (!response.data.data?.length) {
      throw new UnauthorizedException('Broadcaster not found');
    }
    return response.data.data[0];
  }

  /**
   * Uses the broadcaster's token (required by Helix) to check mod status.
   */
  async isUserModeratorOfChannel(
    broadcasterAccessToken: string,
    broadcasterUserId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: unknown[] }>(
          `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterUserId}&user_id=${userId}`,
          {
            headers: {
              'Client-ID': this.clientId,
              Authorization: `Bearer ${broadcasterAccessToken}`,
            },
          },
        ),
      );
      return !!response.data.data?.length;
    } catch (error) {
      this.logger.error('Error checking moderator status', error);
      return false;
    }
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string[] }> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const response = await firstValueFrom(
      this.httpService.post('https://id.twitch.tv/oauth2/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    return response.data;
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await firstValueFrom(
      this.httpService.post('https://id.twitch.tv/oauth2/token', params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    return response.data;
  }
}
