import { Module, type DynamicModule } from '@nestjs/common';
import { VOICE_PROVIDERS } from './injection-tokens';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';
import { VoicesController } from './controllers/voices.controller';
import { SpeakController } from './controllers/speak.controller';
import { SettingsController } from './controllers/settings.controller';
import { UsersController } from './controllers/users.controller';
import { AudioProcessorService } from './services/audio-processor.service';
import { SettingsService } from './services/settings.service';
import { DrizzleModule } from 'nestjs-drizzle/sqlite';
import { schema } from './database/schema';
import { StreamerBotManagerService } from './services/streamer-bot-manager.service';
import { SpeakCommand } from './chat-event-handlers/speak-command';
import { SpeakerttsVoiceProvider } from './services/voice-providers/providers/speakertts.voice-provider';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    DrizzleModule.forRoot({
      schema,
      url: './database.sqlite',
      driver: 'sqlite',
    }) as DynamicModule,
  ],
  controllers: [VoicesController, SpeakController, SettingsController, UsersController],
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
  ],
})
export class AppModule {}
