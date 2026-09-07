import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  sessionId: text('session_id').notNull().primaryKey(),
  broadcasterTwitchId: text('broadcaster_twitch_id').notNull(),
  broadcasterTwitchUsername: text('broadcaster_twitch_username').notNull(),
  connectionToken: text('connection_token').notNull(),
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const moderatorAccess = sqliteTable('moderator_access', {
  id: text('id').notNull().primaryKey(),
  sessionId: text('session_id').notNull(),
  modTwitchId: text('mod_twitch_id').notNull(),
  modTwitchUsername: text('mod_twitch_username').notNull(),
  accessToken: text('access_token').notNull(),
  grantedAt: integer('granted_at', { mode: 'timestamp' }).notNull(),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').notNull().primaryKey(),
  sessionId: text('session_id').notNull(),
  modTwitchId: text('mod_twitch_id'),
  action: text('action').notNull(),
  endpoint: text('endpoint').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
});

export const schema = {
  sessions,
  moderatorAccess,
  auditLog,
};
