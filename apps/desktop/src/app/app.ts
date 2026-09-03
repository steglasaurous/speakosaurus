import { BrowserWindow, shell, screen } from 'electron';
import { rendererAppName, rendererAppPort, electronAppName } from './constants';
import { environment } from '../environments/environment';
import { join } from 'path';
import { format } from 'url';
import { existsSync } from 'fs';
import { NestFactory } from '@nestjs/core';
// import { ElectronIPCTransport } from 'nestjs-electron-ipc-transport';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { type INestApplication, Logger } from '@nestjs/common';
import { MigrationService } from './services/migration.service';

export default class App {
  // Keep a global reference of the window object, if you don't, the window will
  // be closed automatically when the JavaScript object is garbage collected.
  static mainWindow: Electron.BrowserWindow;
  static application: Electron.App;
  static BrowserWindow;
  static nestApp: INestApplication | null = null;
  private static isQuitting = false;

  public static isDevelopmentMode() {
    const isEnvironmentSet: boolean = 'ELECTRON_IS_DEV' in process.env;
    const getFromEnvironment: boolean =
      parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;

    return isEnvironmentSet ? getFromEnvironment : !environment.production;
  }

  private static onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      App.application.quit();
    }
  }

  private static onClose() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    App.mainWindow = null;
  }

  private static onRedirect(event: any, url: string) {
    if (url !== App.mainWindow.webContents.getURL()) {
      // this is a normal external redirect, open it in a new browser window
      event.preventDefault();
      shell.openExternal(url);
    }
  }

  private static async onReady() {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    if (rendererAppName) {
      try {
        await App.startNestApp();

        App.initMainWindow();
        App.loadMainWindow();
      } catch (error) {
        Logger.error('Failed to start application:', error);
        if (error instanceof Error) {
          Logger.error('Error message:', error.message);
          Logger.error('Error stack:', error.stack);
        }
        // Show error to user in production
        if (App.application.isPackaged && App.mainWindow) {
          App.mainWindow.webContents.executeJavaScript(`
            alert('Failed to start application: ${error instanceof Error ? error.message : String(error)}');
          `).catch(() => {
            // If we can't show alert, at least log it
            console.error('Failed to show error dialog');
          });
        }
        // Re-throw to trigger error handlers
        throw error;
      }
    }
  }

  private static async startNestApp() {
    // Run migrations before initializing NestJS
    Logger.log('🔄 Checking for database migrations...');
    const migrationSuccess = await MigrationService.runMigrations();
    
    if (!migrationSuccess) {
      // Logger.error('⚠️  Migrations failed, but continuing with app startup');
      Logger.error('Migrations failed');
      throw new Error('Migrations failed');
      // Consider showing a user notification here in production
    }

    const nestApp = await NestFactory.create(AppModule);
    App.nestApp = nestApp;
    nestApp.enableShutdownHooks();
    const globalPrefix = 'api';
    nestApp.setGlobalPrefix(globalPrefix);
    
    // Enable CORS for the Angular client
    // FOR DEV MODE ONLY.  In production mode, the assets are loaded
    // by electron directly. (I think?)
    nestApp.enableCors({
      origin: 'http://localhost:4200',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    
    const config = new DocumentBuilder()
      .setTitle('Speakosaurus API')
      .setDescription('API for managing voice providers and voices')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(nestApp, config);
    SwaggerModule.setup('api', nestApp, document);
    
    const port = process.env.PORT || 3000;
    await nestApp.listen(port);
    Logger.log(
      `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
    );
    Logger.log(
      `📚 Swagger documentation available at: http://localhost:${port}/api`,
    );
  }

  private static async onBeforeQuit(event: Electron.Event) {
    if (App.isQuitting || !App.nestApp) {
      return;
    }
    event.preventDefault();
    App.isQuitting = true;
    try {
      Logger.log('Closing Nest application (stops managed Piper if running)...');
      await App.nestApp.close();
    } catch (err) {
      Logger.error('Error while closing Nest application', err);
    } finally {
      App.nestApp = null;
      App.application.quit();
    }
  }

  private static onActivate() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (App.mainWindow === null) {
      App.onReady();
    }
  }

  private static initMainWindow() {
    const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
    const width = Math.min(1280, workAreaSize.width || 1280);
    const height = Math.min(720, workAreaSize.height || 720);

    // Create the browser window.
    App.mainWindow = new BrowserWindow({
      width: width,
      height: height,
      title: electronAppName,
      show: false,
      webPreferences: {
        contextIsolation: true,
        backgroundThrottling: false,
        preload: join(__dirname, 'main.preload.js'),
        webSecurity: true, // Keep web security enabled for production
      },
    });
    App.mainWindow.setMenu(null);
    App.mainWindow.center();

    // Add error handlers for debugging
    App.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      Logger.error(`Window failed to load: ${errorDescription} (code: ${errorCode})`);
      Logger.error(`Failed URL: ${validatedURL}`);
    });

    App.mainWindow.webContents.on('did-finish-load', () => {
      Logger.log('Window finished loading');
    });

    App.mainWindow.webContents.on('dom-ready', () => {
      Logger.log('DOM ready');
    });

    // if main window is ready to show, close the splash window and show the main window
    App.mainWindow.once('ready-to-show', () => {
      Logger.log('Window ready to show');
      App.mainWindow.show();
      // if (App.isDevelopmentMode()) {
      //   App.mainWindow.webContents.openDevTools({ mode: 'detach' });
      // }
    });

    // Keep a keyboard shortcut available even with the app menu removed
    App.mainWindow.webContents.on('before-input-event', (event, input) => {
      const isToggleShortcut =
        input.type === 'keyDown' &&
        (input.key === 'F12' ||
          (input.key.toLowerCase() === 'i' && input.control && input.shift));
      if (!isToggleShortcut) {
        return;
      }
      event.preventDefault();
      if (App.mainWindow.webContents.isDevToolsOpened()) {
        App.mainWindow.webContents.closeDevTools();
      } else {
        App.mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });

    // handle all external redirects in a new browser window
    // App.mainWindow.webContents.on('will-navigate', App.onRedirect);
    // App.mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
    //     App.onRedirect(event, url);
    // });

    // Emitted when the window is closed.
    App.mainWindow.on('closed', () => {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      App.mainWindow = null;
    });
  }

  private static loadMainWindow() {
    // load the index.html of the app.
    if (!App.application.isPackaged) {
      App.mainWindow.loadURL(`http://localhost:${rendererAppPort}`);
    } else {
      // In packaged app, try multiple possible locations for the client app
      // Angular's new build system outputs to a 'browser' subdirectory
      const possiblePaths = [
        join(__dirname, '..', rendererAppName, 'browser', 'index.html'), // app.asar/client/browser/index.html (Angular new build)
        join(__dirname, '..', rendererAppName, 'index.html'), // app.asar/client/index.html (fallback)
      ];

      // Find the first path that exists
      let indexPath: string | null = null;
      for (const path of possiblePaths) {
        Logger.log(`Checking if client exists at: ${path}`);
        if (existsSync(path)) {
          indexPath = path;
          Logger.log(`✅ Found client at: ${path}`);
          break;
        } else {
          Logger.warn(`❌ Client not found at: ${path}`);
        }
      }

      if (!indexPath) {
        Logger.error('❌ Could not find client index.html in any expected location');
        Logger.error(`Searched paths:`);
        possiblePaths.forEach((path, index) => {
          Logger.error(`  ${index + 1}. ${path}`);
        });
        Logger.error(`__dirname: ${__dirname}`);
        Logger.error(`app.getAppPath(): ${App.application.getAppPath()}`);
        // Still try to load the first path to get a proper error message
        indexPath = possiblePaths[0];
      }

      const url = format({
        pathname: indexPath,
        protocol: 'file:',
        slashes: true,
      });

      Logger.log(`Loading client from: ${url}`);
      App.mainWindow.loadURL(url);
    }
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    // we pass the Electron.App object and the
    // Electron.BrowserWindow into this function
    // so this class has no dependencies. This
    // makes the code easier to write tests for

    App.BrowserWindow = browserWindow;
    App.application = app;

    App.application.on('window-all-closed', App.onWindowAllClosed); // Quit when all windows are closed.
    App.application.on('ready', App.onReady); // App is ready to load data
    App.application.on('activate', App.onActivate); // App is activated
    App.application.on('before-quit', App.onBeforeQuit);
  }
}
