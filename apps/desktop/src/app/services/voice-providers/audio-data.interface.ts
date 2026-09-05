import { Voice } from "./voice.interface";

export interface AudioData {
    message: string;
    voice: Voice;
    audioFilePath: string; // Path to temporary file containing audio data
    /** Playback gain. 1 = unchanged. */
    volume?: number;
    /** Correlation id for render-timing logs. Present only when logging is enabled. */
    timingId?: string;
}
