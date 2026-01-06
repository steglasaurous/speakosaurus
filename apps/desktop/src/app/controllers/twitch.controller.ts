import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TwitchAuthService } from '../services/twitch-auth.service';

@ApiTags('twitch')
@Controller('twitch')
export class TwitchController {
  private readonly logger = new Logger(TwitchController.name);
  constructor(private readonly twitchAuthService: TwitchAuthService) {}

  @Post('auth/device-code')
  @ApiOperation({
    summary: 'Start Twitch device code flow',
    description: 'Initiates the device code authentication flow and returns the user code and verification URI',
  })
  @ApiResponse({
    status: 200,
    description: 'Device code flow started successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Twitch Client ID not configured',
  })
  async startDeviceCodeFlow() {
    return await this.twitchAuthService.startDeviceCodeFlow();
  }

  @Get('auth/poll')
  @ApiOperation({
    summary: 'Poll for device code completion',
    description: 'Polls Twitch to check if the user has authorized the device code',
  })
  @ApiResponse({
    status: 200,
    description: 'Poll result',
  })
  async pollDeviceCode() {
    return await this.twitchAuthService.pollDeviceCode();
  }

  @Get('auth/status')
  @ApiOperation({
    summary: 'Check authentication status',
    description: 'Returns whether the user is authenticated with Twitch',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication status',
  })
  async getAuthStatus() {
    const isAuthenticated = await this.twitchAuthService.isAuthenticated();
    return { isAuthenticated };
  }

  @Post('auth/logout')
  @ApiOperation({
    summary: 'Logout from Twitch',
    description: 'Clears stored Twitch authentication tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout() {
    await this.twitchAuthService.clearTokens();
    return { success: true };
  }

  @Get('users/search')
  @ApiOperation({
    summary: 'Search for Twitch users',
    description: 'Searches for Twitch users/channels by query',
  })
  @ApiQuery({
    name: 'query',
    description: 'Search query',
    example: 'xQc',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated with Twitch',
  })
  async searchUsers(@Query('query') query: string) {
    if (!query || query.trim() === '') {
      return [];
    }
    return await this.twitchAuthService.searchUsers(query);
  }

  @Get('users/by-username')
  @ApiOperation({
    summary: 'Get Twitch user by username',
    description: 'Gets a Twitch user by their username',
  })
  @ApiQuery({
    name: 'username',
    description: 'Twitch username',
    example: 'xQc',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated with Twitch',
  })
  async getUserByUsername(@Query('username') username: string) {
    if (!username || username.trim() === '') {
      return null;
    }
    return await this.twitchAuthService.getUserByUsername(username);
  }
}

