/**
 * This module is responsible on handling all the inter process communications
 * between the frontend to the electron backend.
 */

import { app, ipcMain, shell } from 'electron';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { environment } from '../../environments/environment';

export default class ElectronEvents {
  static bootstrapElectronEvents(): Electron.IpcMain {
    return ipcMain;
  }
}

// Retrieve app version
ipcMain.handle('get-app-version', (event) => {
  console.log(`Fetching application version... [v${environment.version}]`);

  return environment.version;
});

// Handle App termination
ipcMain.on('quit', (event, code) => {
  app.exit(code);
});

// Open external URL in default browser
ipcMain.handle('open-external-url', async (event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// Open the app logs folder in the OS file manager (Explorer, Nautilus, etc.)
ipcMain.handle('open-logs-folder', async () => {
  try {
    const logsDir = join(app.getPath('userData'), 'logs');
    mkdirSync(logsDir, { recursive: true });
    const errorMessage = await shell.openPath(logsDir);
    if (errorMessage) {
      return { success: false, error: errorMessage };
    }
    return { success: true };
  } catch (error) {
    console.error('Error opening logs folder:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
