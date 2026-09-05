import { contextBridge, ipcRenderer } from 'electron';

export interface AudioPlayData {
    base64: string;
    format: string;
    message: string;
    volume?: number;
    timingId?: string;
    voice: {
        providerName: string;
        voiceId: string;
        voiceName: string;
        displayName: string;
    };
}

export interface AudioTimingPayload {
    timingId: string;
    stage: string;
    ms: number;
}

contextBridge.exposeInMainWorld('electron', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('open-external-url', url),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
});

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
        onAudioStop: (callback: () => void) => {
            ipcRenderer.on('audio:stop', () => {
                callback();
            });
        },
        removeAudioStopListener: () => {
            ipcRenderer.removeAllListeners('audio:stop');
        },
        reportAudioTiming: (payload: AudioTimingPayload) => {
            ipcRenderer.send('audio:timing', payload);
        },
    },
);
