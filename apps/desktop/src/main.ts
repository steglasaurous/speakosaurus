import SquirrelEvents from './app/events/squirrel.events';
import ElectronEvents from './app/events/electron.events';
import { app, BrowserWindow } from 'electron';
import { existsSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import App from './app/app';
import { electronAppName, previousElectronAppName } from './app/constants';
import {
  configureAppLogger,
  ElectronLogNestLogger,
  appLog,
} from './app/logging/app-logger';
import { Logger } from '@nestjs/common';

// Linux dev: Chromium's setuid sandbox often fails without chrome-sandbox (containers, etc.).
// Set ELECTRON_DISABLE_SANDBOX=1 to force off on any platform when debugging packaged builds.
if (
  process.env.ELECTRON_DISABLE_SANDBOX === '1' ||
  (process.platform === 'linux' && !app.isPackaged)
) {
  app.commandLine.appendSwitch('no-sandbox');
}

export default class Main {
  static initialize() {
    // Force a stable runtime app name so Electron resolves userData predictably.
    Main.migrateUserDataIfRenamed();
    app.setName(electronAppName);
    // Linux WM_CLASS / app_id come from package.json "desktopName"
    // (set in root package.json + build.extraMetadata).

    if (SquirrelEvents.handleEvents()) {
      // squirrel event handled (except first run event) and app will exit in 1000ms, so don't do anything else
      app.quit();
    }
  }

  static bootstrapApp() {
    App.main(app, BrowserWindow);
  }

  static bootstrapAppEvents() {
    ElectronEvents.bootstrapElectronEvents();

    // initialize auto updater service
    if (!App.isDevelopmentMode()) {
      // UpdateEvents.initAutoUpdateService();
    }
  }

  /**
   * Copy settings/database from the previous app-name userData folder
   * so a rename does not look like a fresh install.
   */
  private static migrateUserDataIfRenamed() {
    if (previousElectronAppName === electronAppName) {
      return;
    }

    app.setName(previousElectronAppName);
    const previousUserData = app.getPath('userData');
    app.setName(electronAppName);
    const userData = app.getPath('userData');

    if (previousUserData === userData || !existsSync(previousUserData)) {
      return;
    }

    const previousDatabase = join(previousUserData, 'database.sqlite');
    const newDatabase = join(userData, 'database.sqlite');
    if (!existsSync(previousDatabase) || existsSync(newDatabase)) {
      return;
    }

    mkdirSync(userData, { recursive: true });
    cpSync(previousUserData, userData, { recursive: true });
  }

  static setupErrorHandlers() {
    process.on('uncaughtException', (error: Error) => {
      appLog.error('Uncaught Exception:', error);
      if (error.stack) {
        appLog.error('Stack:', error.stack);
      }
    });

    process.on('unhandledRejection', (reason: unknown) => {
      appLog.error('Unhandled Promise Rejection:', reason);
      if (reason instanceof Error && reason.stack) {
        appLog.error('Stack:', reason.stack);
      }
    });
  }
}

// Set app name before configuring the log path (userData depends on it).
Main.initialize();
configureAppLogger(App.isDevelopmentMode());
Logger.overrideLogger(new ElectronLogNestLogger());
Main.setupErrorHandlers();

// bootstrap app
Main.bootstrapApp();
Main.bootstrapAppEvents();
