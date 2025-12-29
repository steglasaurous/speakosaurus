import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ElevenLabsVoiceProvider } from './services/voice-providers/providers/elevenlabs.voice-provider';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { VOICE_PROVIDERS } from './injection-tokens';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';
import { VoicesController } from './controllers/voices.controller';

@Module({
  imports: [],
  controllers: [AppController, VoicesController],
  providers: [
    AppService, 
    ElevenLabsVoiceProvider,
    {
      provide: ElevenLabsClient,
      useValue: new ElevenLabsClient(),
    },
    {
      provide: VOICE_PROVIDERS,
      inject: [ElevenLabsVoiceProvider],
      useFactory: (elevenLabsVoiceProvider: ElevenLabsVoiceProvider) => [elevenLabsVoiceProvider],
    },
    VoiceProviderService,
  ],
})
export class AppModule {}
