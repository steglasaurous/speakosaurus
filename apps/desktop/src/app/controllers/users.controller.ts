import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  UserDto,
  UpdateUserDto,
  CreateCustomIntroDto,
  UpdateCustomIntroDto,
} from '../dto/user.dto';
import { UsersService } from '../services/users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Returns an array of all users with their custom intros',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved list of users',
    type: [UserDto],
  })
  async getAllUsers(): Promise<UserDto[]> {
    const result = await this.usersService.getAllUsers();
    this.logger.log('getAllUsers result', { result });
    return result;
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

