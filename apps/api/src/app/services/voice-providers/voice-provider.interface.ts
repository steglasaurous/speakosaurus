import { AudioData } from "./audio-data.interface";
import { Voice } from "./voice.interface";

export interface VoiceProvider {
    providerName: string;
    getVoices(): Promise<Voice[]>;
    getVoiceById(id: string): Promise<Voice|null>;
    getRenderedMessage(message: string, voice: Voice): Promise<AudioData>;
}
