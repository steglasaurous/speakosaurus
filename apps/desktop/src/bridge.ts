import { contextBridge, ipcRenderer } from 'electron';

// This is essentially the API definition for IPC.  When adding new IPC methods in controllers,
// make sure to add them here as well.
// WONDER: Could this be automated/generated?

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
        onAudioPause: (callback: () => void) => {
            ipcRenderer.on('audio:pause', () => {
                callback();
            });
        },
        removeAudioPauseListener: () => {
            ipcRenderer.removeAllListeners('audio:pause');
        },
        onAudioResume: (callback: () => void) => {
            ipcRenderer.on('audio:resume', () => {
                callback();
            });
        },
        removeAudioResumeListener: () => {
            ipcRenderer.removeAllListeners('audio:resume');
        },
        reportAudioTiming: (payload: AudioTimingPayload) => {
            ipcRenderer.send('audio:timing', payload);
        },
    },
);
