import { Module, type DynamicModule } from '@nestjs/common';
import { VOICE_PROVIDERS } from './injection-tokens';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';
import { VoicesController } from './controllers/voices.controller';
import { SpeakController } from './controllers/speak.controller';
import { SettingsController } from './controllers/settings.controller';
import { UsersController } from './controllers/users.controller';
import { StatusController } from './controllers/status.controller';
import { AudioProcessorService } from './services/audio-processor.service';
import { SettingsService } from './services/settings.service';
import { DrizzleModule } from 'nestjs-drizzle/sqlite';
import { schema } from './database/schema';
import { StreamerBotManagerService } from './services/streamer-bot-manager.service';
import { SpeakCommand } from './chat-event-handlers/speak-command';
import { SpeakerttsVoiceProvider } from './services/voice-providers/providers/speakertts.voice-provider';
import { UsersService } from './services/users.service';
import { TwitchAuthService } from './services/twitch-auth.service';
import { TwitchController } from './controllers/twitch.controller';
import { StreamerBotController } from './controllers/streamerbot.controller';
import { HttpModule } from '@nestjs/axios';
import { StatusEventService } from './services/status-event.service';

@Module({
  imports: [
    DrizzleModule.forRoot({
      schema,
      url: './database.sqlite',
      driver: 'sqlite',
    }) as DynamicModule,
    HttpModule,
  ],
  controllers: [VoicesController, SpeakController, SettingsController, UsersController, TwitchController, StatusController, StreamerBotController],
  providers: [ 
    SpeakerttsVoiceProvider,
    {
      provide: VOICE_PROVIDERS,
      inject: [SpeakerttsVoiceProvider],
      useFactory: (speakerttsVoiceProvider: SpeakerttsVoiceProvider) => [speakerttsVoiceProvider],
    },
    VoiceProviderService,
    AudioProcessorService,
    SettingsService,
    StreamerBotManagerService,
    SpeakCommand,
    UsersService,
    TwitchAuthService,
    StatusEventService,
  ],
})
export class AppModule {}
