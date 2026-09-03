import SquirrelEvents from './app/events/squirrel.events';
import ElectronEvents from './app/events/electron.events';
import { app, BrowserWindow } from 'electron';
import { existsSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import App from './app/app';
import { electronAppName, previousElectronAppName } from './app/constants';

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
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);
      console.error('Stack:', error.stack);
      // In production, you might want to show a dialog or log to file
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error('Unhandled Promise Rejection:', reason);
      if (reason instanceof Error) {
        console.error('Stack:', reason.stack);
      }
      // In production, you might want to show a dialog or log to file
    });
  }
}

// Setup error handlers first
Main.setupErrorHandlers();

// handle setup events as quickly as possible
Main.initialize();

// bootstrap app
Main.bootstrapApp();
Main.bootstrapAppEvents();
