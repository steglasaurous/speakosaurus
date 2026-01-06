import { Injectable, Logger } from '@nestjs/common';
import { DrizzleService } from 'nestjs-drizzle/sqlite';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { StaticAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { SettingsService, Setting } from './settings.service';
import axios from 'axios';

export interface DeviceCodeInfo {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

@Injectable()
export class TwitchAuthService {
  private readonly logger = new Logger(TwitchAuthService.name);
  private authProvider: StaticAuthProvider | null = null;
  private apiClient: ApiClient | null = null;
  private deviceCodePollingInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly drizzleService: DrizzleService<typeof schema>,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Initialize the auth provider with stored tokens
   */
  async initialize(): Promise<void> {
    const clientId = await this.getClientId();
    if (!clientId) {
      this.logger.warn('Twitch Client ID not configured');
      return;
    }

    const tokens = await this.getStoredTokens();
    if (!tokens) {
      this.logger.log('No stored Twitch tokens found');
      return;
    }

    try {
      // Use StaticAuthProvider for device code flow
      // We'll handle token refresh manually when tokens expire
      this.authProvider = new StaticAuthProvider(
        clientId,
        tokens.accessToken,
        tokens.scope
      );

      this.apiClient = new ApiClient({ authProvider: this.authProvider });
      this.logger.log('Twitch auth provider initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Twitch auth provider', error);
    }
  }

  /**
   * Get the Twitch Client ID from settings
   */
  async getClientId(): Promise<string | null> {
    const setting = await this.settingsService.getSetting(Setting.TWITCH_CLIENT_ID);
    return setting?.value || null;
  }

  /**
   * Start device code flow
   */
  async startDeviceCodeFlow(): Promise<DeviceCodeInfo> {
    const clientId = await this.getClientId();
    if (!clientId) {
      throw new Error('Twitch Client ID not configured');
    }

    // Request device code from Twitch
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('scopes', 'user:read:email');
    
    const response = await axios.post('https://id.twitch.tv/oauth2/device', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { user_code, device_code, verification_uri, expires_in, interval } = response.data;

    // Store device code for polling
    await this.drizzleService.db
      .insert(schema.twitchAuth as any)
      .values({
        id: 'device_code',
        accessToken: device_code,
        refreshToken: user_code,
      })
      .onConflictDoUpdate({
        target: [schema.twitchAuth.id] as any,
        set: {
          accessToken: device_code,
          refreshToken: user_code,
        },
      });

    return {
      userCode: user_code,
      deviceCode: device_code,
      verificationUri: verification_uri,
      expiresIn: expires_in,
      interval: interval,
    };
  }

  /**
   * Poll for device code completion
   */
  async pollDeviceCode(): Promise<{ success: boolean; error?: string }> {
    const clientId = await this.getClientId();
    if (!clientId) {
      throw new Error('Twitch Client ID not configured');
    }

    const [stored] = await this.drizzleService.db
      .select()
      .from(schema.twitchAuth as any)
      .where(eq(schema.twitchAuth.id, 'device_code') as any)
      .limit(1);

    if (!stored || !stored.accessToken) {
      throw new Error('No device code found');
    }

    const deviceCode = stored.accessToken;

    try {
      // Poll for token
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('device_code', deviceCode);
      params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
      
      const response = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, expires_in, scope } = response.data;

      if (access_token) {
        console.log('saving tokens', access_token);

        await this.saveTokens({
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresIn: expires_in,
          obtainmentTimestamp: Date.now(),
          scope: scope,
        });
        console.log('tokens saved');
        // Clear device code
        await this.drizzleService.db
          .delete(schema.twitchAuth as any)
          .where(eq(schema.twitchAuth.id, 'device_code') as any);
        console.log('deleted drizzle');
        // Reinitialize with new tokens
        await this.initialize();
        console.log('initialized');
        return { success: true };
      }
    } catch (error: any) {
      if (error.response) {
        const errorData = error.response.data;
        if (errorData.error === 'authorization_pending') {
            console.log('authorization_pending');
          return { success: false, error: 'authorization_pending' };
        }
        if (errorData.error === 'slow_down') {
            console.log('slow_down');
          return { success: false, error: 'slow_down' };
        }
        if (errorData.error === 'expired_token') {
            console.log('expired_token');
          return { success: false, error: 'expired_token' };
        }
      }
      // For other errors, return pending to continue polling
      return { success: false, error: 'authorization_pending' };
    }

    return { success: false };
  }

  /**
   * Get stored tokens from database
   */
  private async getStoredTokens(): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    obtainmentTimestamp: number;
    scope: string[];
  } | null> {
    const [stored] = await this.drizzleService.db
      .select()
      .from(schema.twitchAuth as any)
      .where(eq(schema.twitchAuth.id, 'default') as any)
      .limit(1);

    if (!stored || !stored.accessToken || !stored.refreshToken) {
      return null;
    }

    const expiresAt = stored.expiresAt ? parseInt(stored.expiresAt, 10) : 0;
    // Calculate obtainment timestamp from expiresAt and current time
    const expiresIn = expiresAt > 0 ? Math.max(0, expiresAt - Date.now()) : 0;
    const obtainmentTimestamp = expiresAt > 0 ? expiresAt - expiresIn : Date.now();
    let scope: string[] = [];
    console.log('stored.scope', stored.scope);
    if (stored.scope && stored.scope.length > 0) {
        scope = stored.scope.split(' ');
    }

    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresIn: expiresIn / 1000, // Convert to seconds
      obtainmentTimestamp: obtainmentTimestamp / 1000, // Convert to seconds
      scope,
    };
  }

  /**
   * Save tokens to database
   */
  private async saveTokens(tokenData: {
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
    obtainmentTimestamp?: number;
    scope?: string[];
  }): Promise<void> {
    const expiresAt = tokenData.expiresIn && tokenData.obtainmentTimestamp
      ? (tokenData.obtainmentTimestamp + tokenData.expiresIn * 1000).toString()
      : null;

    await this.drizzleService.db
      .insert(schema.twitchAuth as any)
      .values({
        id: 'default',
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt,
        scope: tokenData.scope?.join(' ') || null,
      })
      .onConflictDoUpdate({
        target: [schema.twitchAuth.id] as any,
        set: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt,
          scope: tokenData.scope?.join(' ') || null,
        },
      });
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    return !!tokens && !!this.authProvider;
  }

  /**
   * Get API client (will be null if not authenticated)
   */
  getApiClient(): ApiClient | null {
    return this.apiClient;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    if (!tokens || !tokens.refreshToken) {
      return false;
    }

    const clientId = await this.getClientId();
    if (!clientId) {
      return false;
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', tokens.refreshToken);
      params.append('client_id', clientId);

      const response = await axios.post('https://id.twitch.tv/oauth2/token', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, expires_in, scope } = response.data;

      if (access_token) {
        await this.saveTokens({
          accessToken: access_token,
          refreshToken: refresh_token || tokens.refreshToken, // Keep old refresh token if new one not provided
          expiresIn: expires_in,
          obtainmentTimestamp: Date.now(),
          scope: scope ? scope.split(' ') : tokens.scope,
        });

        // Reinitialize with new tokens
        await this.initialize();
        return true;
      }
    } catch (error) {
      this.logger.error('Failed to refresh access token', error);
    }

    return false;
  }

  /**
   * Search for Twitch users
   */
  async searchUsers(query: string): Promise<any[]> {
    if (!this.apiClient) {
      await this.initialize();
      if (!this.apiClient) {
        throw new Error('Not authenticated with Twitch');
      }
    }

    try {
      // Twitch API doesn't have a direct user search, so we use channel search
      const channels = await this.apiClient.search.searchChannels(query, { limit: 20 });
      return channels.data.map(channel => ({
        id: channel.id,
        login: channel.name,
        display_name: channel.displayName,
        profile_image_url: channel.thumbnailUrl,
      }));
    } catch (error: any) {
      // If token expired, try to refresh and retry once
      if (error.statusCode === 401 || error.message?.includes('401')) {
        this.logger.log('Token expired, attempting refresh...');
        const refreshed = await this.refreshAccessToken();
        if (refreshed && this.apiClient) {
          try {
            const channels = await this.apiClient.search.searchChannels(query, { limit: 20 });
            return channels.data.map(channel => ({
              id: channel.id,
              login: channel.name,
              display_name: channel.displayName,
              profile_image_url: channel.thumbnailUrl,
            }));
          } catch (retryError) {
            this.logger.error('Error searching Twitch users after refresh', retryError);
            throw retryError;
          }
        }
      }
      this.logger.error('Error searching Twitch users', error);
      throw error;
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<any | null> {
    if (!this.apiClient) {
      await this.initialize();
      if (!this.apiClient) {
        throw new Error('Not authenticated with Twitch');
      }
    }

    try {
      const user = await this.apiClient.users.getUserByName(username);
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        login: user.name,
        display_name: user.displayName,
        profile_image_url: user.profilePictureUrl,
      };
    } catch (error: any) {
      // If token expired, try to refresh and retry once
      if (error.statusCode === 401 || error.message?.includes('401')) {
        this.logger.log('Token expired, attempting refresh...');
        const refreshed = await this.refreshAccessToken();
        if (refreshed && this.apiClient) {
          try {
            const user = await this.apiClient.users.getUserByName(username);
            if (!user) {
              return null;
            }
            return {
              id: user.id,
              login: user.name,
              display_name: user.displayName,
              profile_image_url: user.profilePictureUrl,
            };
          } catch (retryError) {
            this.logger.error('Error getting Twitch user after refresh', retryError);
            throw retryError;
          }
        }
      }
      this.logger.error('Error getting Twitch user', error);
      throw error;
    }
  }

  /**
   * Clear stored tokens (logout)
   */
  async clearTokens(): Promise<void> {
    await this.drizzleService.db
      .delete(schema.twitchAuth as any)
      .where(eq(schema.twitchAuth.id, 'default') as any);
    
    this.authProvider = null;
    this.apiClient = null;
  }
}

