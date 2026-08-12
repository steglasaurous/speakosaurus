import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, from, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  UserDto,
  UpdateUserDto,
  CreateUserDto,
  CreateCustomIntroDto,
  UpdateCustomIntroDto,
} from '../dto/user.dto';
import { UsersService } from '../services/users.service';
import { UserEventService, UserEvent, InitialUsersEvent } from '../services/user-event.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(
    private readonly usersService: UsersService,
    private readonly userEventService: UserEventService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get all users or search users',
    description: 'Returns an array of all users with their custom intros, or searches users if query parameter is provided',
  })
  @ApiQuery({
    name: 'query',
    required: false,
    description: 'Search query to filter users by username or TTS name',
    example: 'john',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of users',
    type: [UserDto],
  })
  async getAllUsers(@Query('query') query?: string): Promise<UserDto[]> {
    if (query) {
      return await this.usersService.searchUsers(query);
    }
    const result = await this.usersService.getAllUsers();
    return result;
  }

  @Get('stream')
  @Sse('users-stream')
  @ApiOperation({
    summary: 'Stream user updates via Server-Sent Events',
    description: 'Returns a stream of user updates. Sends initial user list immediately, then updates when users are created or updated.',
  })
  streamUsers(): Observable<{ data: UserEvent | InitialUsersEvent }> {
    // Get initial users list
    const getCurrentUsers = async (): Promise<UserDto[]> => {
      try {
        return await this.usersService.getAllUsers();
      } catch (error) {
        this.logger.error('Error getting initial users for SSE stream', error);
        return [];
      }
    };

    // Create observable from user event service
    const userUpdates$ = this.userEventService.userUpdates$.pipe(
      map((event) => {
        try {
          return { data: event };
        } catch (error) {
          this.logger.error('Error serializing user event for SSE', error);
          // Return a safe empty event to prevent stream errors
          return { data: { type: 'initial', users: [] } as InitialUsersEvent };
        }
      }),
    );

    // Send initial users list immediately
    const initialUsers$ = from(getCurrentUsers()).pipe(
      map((users) => {
        try {
          return { data: { type: 'initial', users } as InitialUsersEvent };
        } catch (error) {
          this.logger.error('Error serializing initial users for SSE', error);
          return { data: { type: 'initial', users: [] } as InitialUsersEvent };
        }
      }),
    );

    // Merge initial users with updates
    return merge(initialUsers$, userUpdates$);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new user record with Twitch user ID and username',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
    type: UserDto,
  })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserDto> {
    const user = await this.usersService.createUser(
      createUserDto.twitchUserId,
      createUserDto.twitchUsername,
    );
    this.logger.log('createUser result', { user });
    return user;
  }

  @Post('populate-pronouns')
  @ApiOperation({
    summary: 'Populate missing user pronouns',
    description: 'Queries the pronouns service for every user without stored pronouns and updates users when a setting is found',
  })
  @ApiResponse({
    status: 201,
    description: 'Pronoun lookup completed',
  })
  async populateMissingPronouns(): Promise<{
    checked: number;
    updated: number;
    unchanged: number;
  }> {
    return await this.usersService.populateMissingPronouns();
  }

  @Get(':twitchUserId')
  @ApiOperation({
    summary: 'Get a user by Twitch user ID',
    description: 'Returns a single user identified by their Twitch user ID',
  })
  @ApiParam({
    name: 'twitchUserId',
    description: 'Twitch user ID',
    example: '12345678',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the user',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getUser(@Param('twitchUserId') twitchUserId: string): Promise<UserDto> {
    const user = await this.usersService.getUser(twitchUserId);
    if (!user) {
      throw new Error(`User with Twitch ID '${twitchUserId}' not found`);
    }
    return user;
  }

  @Put(':twitchUserId')
  @ApiOperation({
    summary: 'Update a user',
    description: 'Updates user information including TTS name and voice assignment',
  })
  @ApiParam({
    name: 'twitchUserId',
    description: 'Twitch user ID',
    example: '12345678',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully updated',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async updateUser(
    @Param('twitchUserId') twitchUserId: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserDto> {
    const user = await this.usersService.updateUser(twitchUserId, updateUserDto);
    if (!user) {
      throw new Error(`User with Twitch ID '${twitchUserId}' not found`);
    }
    return user;
  }

  @Post(':twitchUserId/intros')
  @ApiOperation({
    summary: 'Add a custom intro for a user',
    description: 'Creates a new custom intro text for the specified user',
  })
  @ApiParam({
    name: 'twitchUserId',
    description: 'Twitch user ID',
    example: '12345678',
  })
  @ApiResponse({
    status: 201,
    description: 'Custom intro successfully created',
  })
  async addCustomIntro(
    @Param('twitchUserId') twitchUserId: string,
    @Body() createIntroDto: CreateCustomIntroDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.usersService.addCustomIntro(twitchUserId, createIntroDto.introText);
    return {
      success: true,
      message: 'Custom intro successfully created',
    };
  }

  @Put('intros/:introId')
  @ApiOperation({
    summary: 'Update a custom intro',
    description: 'Updates an existing custom intro text',
  })
  @ApiParam({
    name: 'introId',
    description: 'Custom intro ID',
    example: 'user123-1234567890-abc123',
  })
  @ApiResponse({
    status: 200,
    description: 'Custom intro successfully updated',
  })
  async updateCustomIntro(
    @Param('introId') introId: string,
    @Body() updateIntroDto: UpdateCustomIntroDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.usersService.updateCustomIntro(introId, updateIntroDto.introText);
    return {
      success: true,
      message: 'Custom intro successfully updated',
    };
  }

  @Delete('intros/:introId')
  @ApiOperation({
    summary: 'Delete a custom intro',
    description: 'Deletes a custom intro by its ID',
  })
  @ApiParam({
    name: 'introId',
    description: 'Custom intro ID',
    example: 'user123-1234567890-abc123',
  })
  @ApiResponse({
    status: 200,
    description: 'Custom intro successfully deleted',
  })
  async deleteCustomIntro(
    @Param('introId') introId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.usersService.deleteCustomIntro(introId);
    return {
      success: true,
      message: 'Custom intro successfully deleted',
    };
  }
}

