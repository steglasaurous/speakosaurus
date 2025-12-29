import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  name: text('name').notNull(),
  value: text('value').notNull(),
});

export const schema = {
  settings,
};

