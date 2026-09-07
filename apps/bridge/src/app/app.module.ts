import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { BroadcasterController } from './controllers/broadcaster.controller';
import { ModeratorController } from './controllers/moderator.controller';
import { SessionManagerService } from './services/session-manager.service';
import { TwitchAuthService } from './services/twitch-auth.service';
import { TokenEncryptionService } from './services/token-encryption.service';
import { BridgeDatabaseService } from './services/bridge-database.service';
import { ModeratorAuthGuard } from './guards/moderator-auth.guard';
import { BroadcasterGateway } from './gateways/broadcaster.gateway';
import { ModeratorGateway } from './gateways/moderator.gateway';

const clientDistCandidates = [
  join(__dirname, '..', '..', '..', '..', 'client', 'browser'),
  join(__dirname, '..', '..', '..', 'client', 'browser'),
  join(process.cwd(), 'dist', 'apps', 'client', 'browser'),
];

const clientRoot = clientDistCandidates.find((p) => existsSync(p));

@Module({
  imports: [
    HttpModule,
    ...(clientRoot
      ? [
          ServeStaticModule.forRoot({
            rootPath: clientRoot,
            // path-to-regexp v8 (Nest 11) rejects "/api/(.*)" — use brace wildcards.
            exclude: [
              '/api/{*path}',
              '/broadcaster/{*path}',
              '/moderator/{*path}',
              '/socket.io/{*path}',
            ],
          }),
        ]
      : []),
  ],
  controllers: [BroadcasterController, ModeratorController],
  providers: [
    BridgeDatabaseService,
    TokenEncryptionService,
    SessionManagerService,
    TwitchAuthService,
    ModeratorAuthGuard,
    BroadcasterGateway,
    ModeratorGateway,
  ],
})
export class AppModule {}
