import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './apps/api/src/app/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './database.sqlite',
  },
});

