import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  name: text('name').notNull(),
  value: text('value').notNull(),
});

export const users = sqliteTable('users', {
  twitchUserId: text('twitch_user_id').notNull().primaryKey(),
  twitchUsername: text('twitch_username').notNull(),
  // The username that TTS should use when speaking.
  ttsName: text('tts_name'),
  ttsProviderName: text('tts_provider_name'),
  ttsVoiceId: text('tts_voice_id'),
  // Whether to disable welcoming this user on first words
  disableWelcome: integer('disable_welcome', { mode: 'boolean' }),
});

export const customIntros = sqliteTable('custom_intros', {
  id: text('id').notNull().primaryKey(),
  twitchUserId: text('twitch_user_id').notNull(),
  introText: text('intro_text').notNull(),
});

export const twitchAuth = sqliteTable('twitch_auth', {
  id: text('id').notNull().primaryKey().default('default'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: text('expires_at'),
  scope: text('scope'),
});

export const schema = {
  settings,
  users,
  customIntros,
  twitchAuth,
};

