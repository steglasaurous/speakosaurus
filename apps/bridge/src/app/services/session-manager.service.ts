import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { Socket } from 'socket.io';
import * as schema from '../database/schema';
import { BridgeDatabaseService } from './bridge-database.service';
import { TokenEncryptionService } from './token-encryption.service';
import { TwitchAuthService } from './twitch-auth.service';

export interface BroadcasterSession {
  sessionId: string;
  broadcasterTwitchId: string;
  broadcasterTwitchUsername: string;
  connectionToken: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  socket?: Socket;
  tokenExpiresAt?: Date | null;
}

export interface ModeratorAccessInfo {
  id: string;
  sessionId: string;
  modTwitchId: string;
  modTwitchUsername: string;
  accessToken: string;
  grantedAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

@Injectable()
export class SessionManagerService implements OnModuleInit {
  private readonly logger = new Logger(SessionManagerService.name);
  private activeSessions = new Map<string, BroadcasterSession>();
  private sessionsByBroadcaster = new Map<string, string>();
  private sessionsByConnectionToken = new Map<string, string>();
  private moderatorTokens = new Map<string, ModeratorAccessInfo>();

  constructor(
    private readonly database: BridgeDatabaseService,
    private readonly encryption: TokenEncryptionService,
    private readonly twitchAuth: TwitchAuthService,
  ) {}

  async onModuleInit() {
    await this.loadActiveSessions();
  }

  private async loadActiveSessions() {
    try {
      const rows = await this.database.db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true));

      for (const row of rows) {
        if (new Date(row.expiresAt) < new Date()) {
          await this.deactivateSession(row.sessionId);
          continue;
        }
        this.indexSession({
          sessionId: row.sessionId,
          broadcasterTwitchId: row.broadcasterTwitchId,
          broadcasterTwitchUsername: row.broadcasterTwitchUsername,
          connectionToken: row.connectionToken,
          createdAt: new Date(row.createdAt),
          expiresAt: new Date(row.expiresAt),
          isActive: true,
          tokenExpiresAt: row.tokenExpiresAt ? new Date(row.tokenExpiresAt) : null,
        });
      }
      this.logger.log(`Loaded ${this.activeSessions.size} active sessions`);
    } catch (error) {
      this.logger.error('Error loading active sessions', error);
    }
  }

  private indexSession(session: BroadcasterSession) {
    this.activeSessions.set(session.sessionId, session);
    this.sessionsByBroadcaster.set(session.broadcasterTwitchId, session.sessionId);
    this.sessionsByConnectionToken.set(session.connectionToken, session.sessionId);
  }

  async createSession(params: {
    broadcasterTwitchId: string;
    broadcasterTwitchUsername: string;
    twitchAccessToken: string;
    twitchRefreshToken?: string;
    tokenExpiresAt?: Date;
    expiryHours?: number;
  }): Promise<BroadcasterSession> {
    const existingSessionId = this.sessionsByBroadcaster.get(params.broadcasterTwitchId);
    if (existingSessionId) {
      await this.deactivateSession(existingSessionId);
    }

    const expiryHours = params.expiryHours ?? parseInt(process.env.SESSION_EXPIRY_HOURS || '24', 10);
    const sessionId = `sess_${uuid()}`;
    const connectionToken = `conn_${uuid()}`;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + expiryHours * 60 * 60 * 1000);

    const encryptedAccessToken = this.encryption.encrypt(params.twitchAccessToken);
    const encryptedRefreshToken = params.twitchRefreshToken
      ? this.encryption.encrypt(params.twitchRefreshToken)
      : null;

    await this.database.db.insert(schema.sessions).values({
      sessionId,
      broadcasterTwitchId: params.broadcasterTwitchId,
      broadcasterTwitchUsername: params.broadcasterTwitchUsername,
      connectionToken,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
      createdAt,
      expiresAt,
      isActive: true,
    });

    const session: BroadcasterSession = {
      sessionId,
      broadcasterTwitchId: params.broadcasterTwitchId,
      broadcasterTwitchUsername: params.broadcasterTwitchUsername,
      connectionToken,
      createdAt,
      expiresAt,
      isActive: true,
      tokenExpiresAt: params.tokenExpiresAt ?? null,
    };
    this.indexSession(session);
    this.logger.log(`Created session ${sessionId} for ${params.broadcasterTwitchUsername}`);
    return session;
  }

  async getBroadcasterAccessToken(sessionId: string): Promise<string> {
    const [row] = await this.database.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.sessionId, sessionId))
      .limit(1);

    if (!row?.encryptedAccessToken) {
      throw new UnauthorizedException('Broadcaster token unavailable');
    }

    let accessToken = this.encryption.decrypt(row.encryptedAccessToken);
    const refreshToken = row.encryptedRefreshToken
      ? this.encryption.decrypt(row.encryptedRefreshToken)
      : null;

    const needsRefresh =
      !!refreshToken &&
      (!!row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() < Date.now() + 60_000 : false);

    if (needsRefresh && refreshToken) {
      try {
        const refreshed = await this.twitchAuth.refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
        await this.database.db
          .update(schema.sessions)
          .set({
            encryptedAccessToken: this.encryption.encrypt(refreshed.access_token),
            encryptedRefreshToken: this.encryption.encrypt(
              refreshed.refresh_token || refreshToken,
            ),
            tokenExpiresAt,
          })
          .where(eq(schema.sessions.sessionId, sessionId));
      } catch (error) {
        this.logger.error('Failed to refresh broadcaster token', error);
      }
    }

    return accessToken;
  }

  async authenticateConnection(connectionToken: string): Promise<BroadcasterSession> {
    const sessionId = this.sessionsByConnectionToken.get(connectionToken);
    const session = sessionId ? this.activeSessions.get(sessionId) : undefined;
    if (!session) {
      throw new UnauthorizedException('Invalid connection token');
    }
    if (new Date(session.expiresAt) < new Date()) {
      await this.deactivateSession(session.sessionId);
      throw new UnauthorizedException('Session expired');
    }
    return session;
  }

  attachSocket(sessionId: string, socket: Socket): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.socket = socket;
    }
  }

  detachSocket(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.socket = undefined;
    }
  }

  getSessionByBroadcaster(broadcasterTwitchId: string): BroadcasterSession | undefined {
    const sessionId = this.sessionsByBroadcaster.get(broadcasterTwitchId);
    return sessionId ? this.activeSessions.get(sessionId) : undefined;
  }

  getSessionByUsername(username: string): BroadcasterSession | undefined {
    const lowered = username.toLowerCase();
    return Array.from(this.activeSessions.values()).find(
      (s) => s.broadcasterTwitchUsername.toLowerCase() === lowered,
    );
  }

  getSession(sessionId: string): BroadcasterSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  async deactivateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.socket?.disconnect(true);
    this.activeSessions.delete(sessionId);
    this.sessionsByBroadcaster.delete(session.broadcasterTwitchId);
    this.sessionsByConnectionToken.delete(session.connectionToken);

    for (const [token, info] of this.moderatorTokens.entries()) {
      if (info.sessionId === sessionId) {
        this.moderatorTokens.delete(token);
      }
    }

    await this.database.db
      .update(schema.sessions)
      .set({ isActive: false })
      .where(eq(schema.sessions.sessionId, sessionId));

    this.logger.log(`Deactivated session ${sessionId}`);
  }

  async grantModeratorAccess(
    sessionId: string,
    modTwitchId: string,
    modTwitchUsername: string,
  ): Promise<string> {
    if (!this.activeSessions.get(sessionId)) {
      throw new UnauthorizedException('Invalid session');
    }

    const accessToken = `mod_${uuid()}`;
    const id = `modaccess_${uuid()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const accessInfo: ModeratorAccessInfo = {
      id,
      sessionId,
      modTwitchId,
      modTwitchUsername,
      accessToken,
      grantedAt: now,
      lastActiveAt: now,
      expiresAt,
    };

    await this.database.db.insert(schema.moderatorAccess).values({
      id,
      sessionId,
      modTwitchId,
      modTwitchUsername,
      accessToken,
      grantedAt: now,
      lastActiveAt: now,
      expiresAt,
    });

    this.moderatorTokens.set(accessToken, accessInfo);
    return accessToken;
  }

  async validateModeratorToken(accessToken: string): Promise<ModeratorAccessInfo> {
    let accessInfo = this.moderatorTokens.get(accessToken);
    if (!accessInfo) {
      const [row] = await this.database.db
        .select()
        .from(schema.moderatorAccess)
        .where(eq(schema.moderatorAccess.accessToken, accessToken))
        .limit(1);
      if (!row) {
        throw new UnauthorizedException('Invalid moderator token');
      }
      accessInfo = {
        id: row.id,
        sessionId: row.sessionId,
        modTwitchId: row.modTwitchId,
        modTwitchUsername: row.modTwitchUsername,
        accessToken: row.accessToken,
        grantedAt: new Date(row.grantedAt),
        lastActiveAt: new Date(row.lastActiveAt),
        expiresAt: new Date(row.expiresAt),
      };
      this.moderatorTokens.set(accessToken, accessInfo);
    }

    if (new Date(accessInfo.expiresAt) < new Date()) {
      throw new UnauthorizedException('Moderator token expired');
    }

    const session = this.activeSessions.get(accessInfo.sessionId);
    if (!session) {
      throw new UnauthorizedException('Session no longer active');
    }

    accessInfo.lastActiveAt = new Date();
    await this.database.db
      .update(schema.moderatorAccess)
      .set({ lastActiveAt: accessInfo.lastActiveAt })
      .where(eq(schema.moderatorAccess.id, accessInfo.id));

    return accessInfo;
  }

  async logAction(
    sessionId: string,
    modTwitchId: string | null,
    action: string,
    endpoint: string,
    success: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.database.db.insert(schema.auditLog).values({
        id: `audit_${uuid()}`,
        sessionId,
        modTwitchId,
        action,
        endpoint,
        timestamp: new Date(),
        success,
        errorMessage: errorMessage || null,
      });
    } catch (error) {
      this.logger.error('Error logging action', error);
    }
  }
}
