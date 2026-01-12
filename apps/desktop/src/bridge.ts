import { contextBridge, ipcRenderer } from 'electron';

// This is essentially the API definition for IPC.  When adding new IPC methods in controllers,
// make sure to add them here as well.
// WONDER: Could this be automated/generated?

export interface AudioPlayData {
    base64: string;
    format: string;
    message: string;
    voice: {
        providerName: string;
        voiceId: string;
        voiceName: string;
        displayName: string;
    };
}

contextBridge.exposeInMainWorld(
    'AppBridge',
    {
        onAudioPlay: (callback: (data: AudioPlayData) => void) => {
            ipcRenderer.on('audio:play', (_event, data: AudioPlayData) => {
                callback(data);
            });
        },
        removeAudioPlayListener: () => {
            ipcRenderer.removeAllListeners('audio:play');
        },
    },
);
