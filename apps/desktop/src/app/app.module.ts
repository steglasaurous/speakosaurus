import { Module, type DynamicModule, OnModuleInit, Injectable, Logger } from '@nestjs/common';
import { VOICE_PROVIDERS } from './injection-tokens';
import { VoiceProviderService } from './services/voice-providers/voice-provider.service';
import { CustomVoicesService } from './services/custom-voices.service';
import { CustomVoicesController } from './controllers/custom-voices.controller';
import { VoicesController } from './controllers/voices.controller';
import { SpeakController } from './controllers/speak.controller';
import { SettingsController } from './controllers/settings.controller';
import { UsersController } from './controllers/users.controller';
import { StatusController } from './controllers/status.controller';
import { AudioProcessorService } from './services/audio-processor.service';
import { SettingsService, Setting } from './services/settings.service';
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
import { UserEventService } from './services/user-event.service';
import { MigrationService } from './services/migration.service';
import { PiperHttpServerService } from './services/piper-http-server.service';
import { PiperVoiceCatalogService } from './services/piper-voice-catalog.service';
import { RenderTimingService } from './services/render-timing.service';
import { BridgeClientService } from './services/bridge-client.service';
import { RemoteAccessController } from './controllers/remote-access.controller';

@Injectable()
class RemoteAccessBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RemoteAccessBootstrapService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly bridgeClient: BridgeClientService,
  ) {}

  async onModuleInit() {
    try {
      const enabled =
        (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_ENABLED))?.value === 'true';
      if (!enabled) {
        return;
      }
      const bridgeUrl = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_BRIDGE_URL))
        ?.value;
      const sessionId = (await this.settingsService.getSetting(Setting.REMOTE_ACCESS_SESSION_ID))
        ?.value;
      const connectionToken = (
        await this.settingsService.getSetting(Setting.REMOTE_ACCESS_CONNECTION_TOKEN)
      )?.value;
      if (bridgeUrl && sessionId && connectionToken) {
        await this.bridgeClient.connect(bridgeUrl, sessionId, connectionToken);
        this.logger.log('Reconnected remote access session on startup');
      }
    } catch (error) {
      this.logger.warn('Failed to restore remote access connection on startup', error);
    }
  }
}

@Module({
  imports: [
    DrizzleModule.forRoot({
      schema,
      url: MigrationService.getDatabasePath(),
      driver: 'sqlite',
    }) as DynamicModule,
    HttpModule,
  ],
  controllers: [
    VoicesController,
    SpeakController,
    SettingsController,
    UsersController,
    TwitchController,
    StatusController,
    StreamerBotController,
    CustomVoicesController,
    RemoteAccessController,
  ],
  providers: [
    SpeakerttsVoiceProvider,
    {
      provide: VOICE_PROVIDERS,
      inject: [SpeakerttsVoiceProvider],
      useFactory: (speakerttsVoiceProvider: SpeakerttsVoiceProvider) => [speakerttsVoiceProvider],
    },
    PiperHttpServerService,
    PiperVoiceCatalogService,
    RenderTimingService,
    VoiceProviderService,
    CustomVoicesService,
    AudioProcessorService,
    SettingsService,
    StreamerBotManagerService,
    SpeakCommand,
    UsersService,
    TwitchAuthService,
    StatusEventService,
    UserEventService,
    BridgeClientService,
    RemoteAccessBootstrapService,
  ],
})
export class AppModule {}
