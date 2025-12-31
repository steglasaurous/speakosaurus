import { Module, type DynamicModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ElevenLabsVoiceProvider } from './services/voice-providers/providers/elevenlabs.voice-provider';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VOICE_PROVIDERS } from './injection-tokens';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';
import { VoicesController } from './controllers/voices.controller';
import { SpeakController } from './controllers/speak.controller';
import { SettingsController } from './controllers/settings.controller';
import { AudioProcessorService } from './services/audio-processor.service';
import { SettingsService } from './services/settings.service';
import { DrizzleModule } from 'nestjs-drizzle/sqlite';
import { schema } from './database/schema';
import { StreamerBotService } from '@streamtools/util-streamer-bot';
import { SpeakCommand } from './chat-event-handlers/speak-command';
import { SpeakerttsVoiceProvider } from './services/voice-providers/providers/speakertts.voice-provider';

@Module({
  imports: [
    DrizzleModule.forRoot({
      schema,
      url: './database.sqlite',
      driver: 'sqlite',
    }) as DynamicModule,
  ],
  controllers: [AppController, VoicesController, SpeakController, SettingsController],
  providers: [
    AppService, 
    ElevenLabsVoiceProvider,
    SpeakerttsVoiceProvider,
    {
      provide: ElevenLabsClient,
      useValue: new ElevenLabsClient(),
    },
    {
      provide: VOICE_PROVIDERS,
      inject: [ElevenLabsVoiceProvider, SpeakerttsVoiceProvider],
      useFactory: (elevenLabsVoiceProvider: ElevenLabsVoiceProvider, speakerttsVoiceProvider: SpeakerttsVoiceProvider) => [elevenLabsVoiceProvider, speakerttsVoiceProvider],
    },
    VoiceProviderService,
    AudioProcessorService,
    SettingsService,
    {
      provide: StreamerBotService,
      useFactory: () => {
        const sb = new StreamerBotService(
          process.env.STREAMERBOT_WS_URL || 'ws://localhost:8080', 
          process.env.STREAMERBOT_USE_MOCK === 'true'
        );

        sb.subscribeToEvent('Twitch.ChatMessage');
        sb.subscribeToEvent('Twitch.FirstWord');

        return sb;
      }
    },
    SpeakCommand,
  ],
})
export class AppModule {}
