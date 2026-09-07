import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionManagerService } from '../services/session-manager.service';

export interface BroadcasterCommand {
  type: 'request';
  requestId: string;
  method: string;
  endpoint: string;
  body?: unknown;
  query?: Record<string, unknown>;
}

export interface BroadcasterResponse {
  type: 'response';
  requestId: string;
  statusCode: number;
  body?: unknown;
  error?: string;
}

export interface BroadcasterEvent {
  type: 'event';
  eventType: string;
  data: unknown;
}

@WebSocketGateway({
  namespace: '/broadcaster',
  cors: { origin: true, credentials: true },
})
export class BroadcasterGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BroadcasterGateway.name);
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: BroadcasterResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private moderatorRooms = new Map<string, Set<string>>(); // sessionId -> socket ids

  constructor(private readonly sessionManager: SessionManagerService) {}

  async handleConnection(client: Socket) {
    try {
      const connectionToken =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);

      if (!connectionToken) {
        client.disconnect(true);
        return;
      }

      const session = await this.sessionManager.authenticateConnection(connectionToken);
      (client as Socket & { sessionId?: string }).sessionId = session.sessionId;
      this.sessionManager.attachSocket(session.sessionId, client);

      this.logger.log(
        `Broadcaster connected: ${session.broadcasterTwitchUsername} (${session.sessionId})`,
      );
      client.emit('authenticated', {
        sessionId: session.sessionId,
        broadcasterTwitchId: session.broadcasterTwitchId,
        broadcasterTwitchUsername: session.broadcasterTwitchUsername,
      });
    } catch (error) {
      this.logger.error('Broadcaster connection failed', error);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const sessionId = (client as Socket & { sessionId?: string }).sessionId;
    if (sessionId) {
      this.sessionManager.detachSocket(sessionId);
      this.logger.log(`Broadcaster disconnected (${sessionId})`);
    }
  }

  @SubscribeMessage('response')
  handleResponse(@MessageBody() data: BroadcasterResponse) {
    const pending = this.pendingRequests.get(data.requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(data.requestId);
    if (data.statusCode >= 200 && data.statusCode < 300) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(data.error || 'Request failed'));
    }
  }

  @SubscribeMessage('event')
  handleEvent(
    @MessageBody() data: BroadcasterEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = (client as Socket & { sessionId?: string }).sessionId;
    if (!sessionId) {
      return;
    }
    this.server.to(`mods:${sessionId}`).emit('event', data);
  }

  registerModeratorSocket(sessionId: string, client: Socket) {
    client.join(`mods:${sessionId}`);
    if (!this.moderatorRooms.has(sessionId)) {
      this.moderatorRooms.set(sessionId, new Set());
    }
    this.moderatorRooms.get(sessionId)!.add(client.id);
  }

  async sendCommand(
    sessionId: string,
    method: string,
    endpoint: string,
    body?: unknown,
    query?: Record<string, unknown>,
    timeoutMs = 60000,
  ): Promise<BroadcasterResponse> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session?.socket) {
      throw new Error('Broadcaster not connected');
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const command: BroadcasterCommand = {
      type: 'request',
      requestId,
      method,
      endpoint,
      body,
      query,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      session.socket!.emit('command', command);
    });
  }
}
