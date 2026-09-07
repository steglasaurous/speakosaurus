import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../database/schema';

/**
 * Bridge DB uses @libsql/client (Node-native) instead of better-sqlite3.
 * better-sqlite3 is rebuilt for Electron's ABI for the desktop app; sharing that
 * binary with the Node-based bridge causes NODE_MODULE_VERSION mismatches.
 */
@Injectable()
export class BridgeDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(BridgeDatabaseService.name);
  private client!: Client;
  db!: LibSQLDatabase<typeof schema>;

  async onModuleInit() {
    const configured = process.env.DATABASE_URL || join(process.cwd(), 'data', 'bridge.db');
    const dbPath = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    mkdirSync(dirname(dbPath), { recursive: true });

    this.client = createClient({ url: `file:${dbPath}` });
    this.db = drizzle(this.client, { schema });

    const migrationsFolder = join(__dirname, 'drizzle');
    try {
      await migrate(this.db, { migrationsFolder });
      this.logger.log(`Bridge database ready at ${dbPath}`);
    } catch (error) {
      this.logger.warn(`Migration via drizzle failed, applying bootstrap SQL: ${error}`);
      await this.ensureTables();
      this.logger.log(`Bridge database ready at ${dbPath} (bootstrap schema)`);
    }
  }

  private async ensureTables() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS sessions (
        session_id text PRIMARY KEY NOT NULL,
        broadcaster_twitch_id text NOT NULL,
        broadcaster_twitch_username text NOT NULL,
        connection_token text NOT NULL,
        encrypted_access_token text,
        encrypted_refresh_token text,
        token_expires_at integer,
        created_at integer NOT NULL,
        expires_at integer NOT NULL,
        is_active integer DEFAULT 1 NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS moderator_access (
        id text PRIMARY KEY NOT NULL,
        session_id text NOT NULL,
        mod_twitch_id text NOT NULL,
        mod_twitch_username text NOT NULL,
        access_token text NOT NULL,
        granted_at integer NOT NULL,
        last_active_at integer NOT NULL,
        expires_at integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id text PRIMARY KEY NOT NULL,
        session_id text NOT NULL,
        mod_twitch_id text,
        action text NOT NULL,
        endpoint text NOT NULL,
        timestamp integer NOT NULL,
        success integer NOT NULL,
        error_message text
      )`,
    ];
    for (const sql of statements) {
      await this.client.execute(sql);
    }
  }
}
