import { app } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Logger } from '@nestjs/common';
import type { Database as BetterSQLite3Database } from 'better-sqlite3';

export class MigrationService {
  /**
   * Resolves the database path based on whether the app is packaged or in development
   */
  static getDatabasePath(): string {
    if (app.isPackaged) {
      // In packaged app, use userData directory for persistence across updates
      return join(app.getPath('userData'), 'database.sqlite');
    } else {
      // In development, use relative path
      return './database.sqlite';
    }
  }

  /**
   * Resolves the migrations folder path based on whether the app is packaged or in development
   */
  static getMigrationsPath(): string {
    if (app.isPackaged) {
      // In packaged app, migrations are in the app's resources directory
      // Try multiple possible locations for packaged apps
      
      // 1. First try: resources/drizzle (outside asar, where assets are typically placed)
      // process.resourcesPath is set by Electron and points to the resources folder
      let resourcesPath = process.resourcesPath;
      if (!resourcesPath) {
        // Fallback: calculate from execPath (executable location)
        // Structure: .../win-unpacked/Speakosaurus.exe -> .../win-unpacked/resources
        resourcesPath = join(process.execPath, '..', '..', 'resources');
      }
      const resourcesDrizzlePath = join(resourcesPath, 'drizzle');
      Logger.log(`Checking migrations path: ${resourcesDrizzlePath}`);
      if (existsSync(resourcesDrizzlePath)) {
        Logger.log(`✅ Found migrations at: ${resourcesDrizzlePath}`);
        return resourcesDrizzlePath;
      }
      
      // 2. Try: app.asar.unpacked/drizzle (if unpacked)
      const appPath = app.getAppPath();
      if (appPath.includes('app.asar')) {
        const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
        const unpackedDrizzlePath = join(unpackedPath, 'drizzle');
        Logger.log(`Checking migrations path: ${unpackedDrizzlePath}`);
        if (existsSync(unpackedDrizzlePath)) {
          Logger.log(`✅ Found migrations at: ${unpackedDrizzlePath}`);
          return unpackedDrizzlePath;
        }
      }
      
      // 3. Try: relative to app path (in case drizzle is in the asar)
      const asarDrizzlePath = join(appPath, 'drizzle');
      Logger.log(`Checking migrations path: ${asarDrizzlePath}`);
      if (existsSync(asarDrizzlePath)) {
        Logger.log(`✅ Found migrations at: ${asarDrizzlePath}`);
        return asarDrizzlePath;
      }
      
      // 4. Log all attempted paths for debugging
      Logger.warn(`⚠️ Migrations not found. Attempted paths:`);
      Logger.warn(`  1. ${resourcesDrizzlePath}`);
      if (appPath.includes('app.asar')) {
        Logger.warn(`  2. ${appPath.replace('app.asar', 'app.asar.unpacked')}/drizzle`);
      }
      Logger.warn(`  3. ${asarDrizzlePath}`);
      Logger.warn(`  process.resourcesPath: ${process.resourcesPath}`);
      Logger.warn(`  app.getAppPath(): ${appPath}`);
      Logger.warn(`  __dirname: ${__dirname}`);
      
      // Last resort: return resources path (will fail with clear error if not found)
      return resourcesDrizzlePath;
    } else {
      // In development/build mode, try multiple possible locations
      // 1. First try: dist/apps/desktop/drizzle (where assets are copied during build)
      const distPath = join(__dirname, '../../../drizzle');
      if (existsSync(distPath)) {
        return distPath;
      }
      
      // 2. Fallback: project root drizzle folder (for development)
      const projectRootPath = join(__dirname, '../../../../drizzle');
      if (existsSync(projectRootPath)) {
        return projectRootPath;
      }
      
      // 3. Last resort: use dist path anyway (will fail with clear error if not found)
      return distPath;
    }
  }

  /**
   * Runs all pending migrations
   * @returns Promise<boolean> - true if migrations succeeded, false otherwise
   */
  static async runMigrations(): Promise<boolean> {
    let sqlite: BetterSQLite3Database | null = null;
    try {
      const dbPath = MigrationService.getDatabasePath();
      const migrationsPath = MigrationService.getMigrationsPath();

      Logger.log(`Running migrations...`);
      Logger.log(`Database path: ${dbPath}`);
      Logger.log(`Migrations path: ${migrationsPath}`);

      // Verify migrations folder exists
      if (!existsSync(migrationsPath)) {
        Logger.error(`❌ Migrations folder not found: ${migrationsPath}`);
        return false;
      }

      // Create database connection with proper settings
      sqlite = new Database(dbPath);
      
      // Enable foreign keys and other SQLite settings
      sqlite.pragma('foreign_keys = ON');
      
      const db = drizzle(sqlite);

      // Run migrations
      migrate(db, { migrationsFolder: migrationsPath });

      Logger.log('✅ Migrations completed successfully');
      
      return true;
    } catch (error) {
      // Log full error details
      if (error instanceof Error) {
        Logger.error(`❌ Migration failed: ${error.message}`);
        if (error.stack) {
          Logger.error(`Error stack: ${error.stack}`);
        }
        // Check if it's a DrizzleError with more details
        if ('cause' in error && error.cause) {
          Logger.error(`Error cause:`, error.cause);
        }
      } else {
        Logger.error('❌ Migration failed:', error);
      }
      return false;
    } finally {
      // Always close the database connection
      if (sqlite) {
        try {
          sqlite.close();
        } catch (closeError) {
          Logger.warn('Warning: Error closing database connection:', closeError);
        }
      }
    }
  }
}
