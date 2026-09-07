import type { Config } from 'drizzle-kit';

export default {
  schema: './src/app/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/bridge.db',
  },
} satisfies Config;
