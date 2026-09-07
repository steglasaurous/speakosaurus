import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { SessionManagerService } from '../services/session-manager.service';
import { BroadcasterGateway } from './broadcaster.gateway';

@WebSocketGateway({
  namespace: '/moderator',
  cors: { origin: true, credentials: true },
})
export class ModeratorGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ModeratorGateway.name);

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly broadcasterGateway: BroadcasterGateway,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const access = await this.sessionManager.validateModeratorToken(token);
      this.broadcasterGateway.registerModeratorSocket(access.sessionId, client);
      (client as Socket & { sessionId?: string }).sessionId = access.sessionId;
      client.emit('authenticated', {
        sessionId: access.sessionId,
        modTwitchUsername: access.modTwitchUsername,
      });
      this.logger.log(
        `Moderator ${access.modTwitchUsername} connected to session ${access.sessionId}`,
      );
    } catch (error) {
      this.logger.warn('Moderator WS auth failed', error);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() _body: unknown) {
    client.emit('pong', { ok: true });
  }
}
