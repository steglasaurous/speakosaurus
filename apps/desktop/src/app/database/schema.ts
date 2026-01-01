import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  name: text('name').notNull(),
  value: text('value').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').notNull().primaryKey(),
  twitchUsername: text('twitch_username').notNull(),
  twitchUserId: text('twitch_user_id').notNull(),
  // The username that TTS should use when speaking.
  ttsName: text('tts_name'),
  ttsProviderName: text('tts_provider_name'),
  ttsVoiceId: text('tts_voice_id'),
});

export const schema = {
  settings,
};

