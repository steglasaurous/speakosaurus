import { Voice } from "./voice.interface";

export interface AudioData {
    message: string;
    voice: Voice;
    audio: Buffer; // Binary audio data ready for playback
}
