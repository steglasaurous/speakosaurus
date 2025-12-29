import { Voice } from "./voice.interface";

export interface AudioData {
    message: string;
    voice: Voice;
    audioFilePath: string; // Path to temporary file containing audio data
}
