import { contextBridge, ipcRenderer } from 'electron';

// This is essentially the API definition for IPC.  When adding new IPC methods in controllers,
// make sure to add them here as well.
// WONDER: Could this be automated/generated?
contextBridge.exposeInMainWorld(
    'AppBridge',
    {
        
    },
);
