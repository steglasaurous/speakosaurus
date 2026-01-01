import * as speaker from 'speakertts';
import { VoiceProvider } from '../voice-provider.interface';
import { Voice } from '../voice.interface';
import { v4 as uuid } from "uuid";
import { join } from "path";
import { tmpdir } from "os";
import { AudioData } from '../audio-data.interface';
import * as childProcess from 'child_process';
import { Logger } from '@nestjs/common';

export class SpeakerttsVoiceProvider implements VoiceProvider {
    providerName = 'speakertts';
    speaker: speaker.Speaker;
    private logger: Logger = new Logger(SpeakerttsVoiceProvider.constructor.name);

    constructor() {
        this.speaker = new speaker.Speaker();
    }

    async getVoices(): Promise<Voice[]> {
        return new Promise<Voice[]>((resolve, reject) => {
            const output: Voice[] = [];
            if (process.platform === 'darwin') {
                // On mac, the list is a bit different, so we need to parse it differently.  Example:
                // Eddy (English (UK)) en_GB    # Hello! My name is Eddy.
                // Also, the installed version of speakertts does not implement getInstalledVoices for darwin, so we're
                // doing it ourselves.
                const child = childProcess.spawn('say', ['-v', '?']);
                
                child.stderr.setEncoding('ascii');
                let rawVoices = '';
                child.stdout.on('data', (data) => {
                    rawVoices += data;
                });

                child.stderr.on('data', (data) => {
                    console.error(data.toString());
                });
                child.addListener('exit', (code, signal) => {
                    
                    if (code === null || signal !== null) {
                        reject(new Error(`Failed to get voices: ${signal || code}`));
                        return;
                    }
                    if (rawVoices.length > 0) {
                        for (const voice of rawVoices.split('\n')) {
                            const voiceRegex = /^(?<name>.+?)(?:\((?<bracketContent>.+?)\))?\s+(?<locale>[a-z]{2}_[A-Z]{2})/;
                            const match = voice.match(voiceRegex);
                            if (match) {
                                let name = match.groups?.name || '';
                                if (match.groups?.bracketContent) {
                                    name = name + '(' + match.groups?.bracketContent + ')';
                                }
        
                                output.push({
                                    providerName: this.providerName,
                                    voiceId: name,
                                    voiceName: name,
                                    displayName: name
                                });
                            }
                        }
                        resolve(output);
                        return;

                    }
                });
                return;
            }

            this.speaker.getInstalledVoices((error: Error | null, voices: string[]) => {
                if (error) {
                    console.error('Error getting voices:', error);
                    reject(error);
                    return;
                }
                
                if (process.platform === 'darwin') {
                    
                    for (const voice of voices) {
                        const voiceRegex = /^(?<name>.+?)(?:\((?<bracketContent>.+?)\))?\s+(?<locale>[a-z]{2}_[A-Z]{2})/;
                        const match = voice.match(voiceRegex);
                        if (match) {
                            let name = match.groups?.name || '';
                            if (match.groups?.bracketContent) {
                                name = name + '(' + match.groups?.bracketContent + ')';
                            }

                            output.push({
                                providerName: this.providerName,
                                voiceId: name,
                                voiceName: name,
                                displayName: name
                            });
                        }
                    }
                    resolve(output);
                    return;
                }

                for (const voice of voices) {
                    output.push({
                        providerName: this.providerName,
                        voiceId: voice,
                        voiceName: voice,
                        displayName: voice,
                    });
                }
                resolve(output);
              });
        });
    }

    async getVoiceById(id: string): Promise<Voice|null> {
        const voices = await this.getVoices();
        return voices.find(voice => voice.voiceId === id) || null;
    }

    async getRenderedMessage(message: string, voice: Voice): Promise<AudioData> {
        const fileName = `${uuid()}.wav`;
        const tempFilePath = join(tmpdir(), fileName);
        
        return new Promise<AudioData>((resolve, reject) => {
            this.logger.log('Exporting message', { message, voice, tempFilePath });
            this.speaker.export(message, voice.voiceId, null, null, tempFilePath, (error: Error | null) => {
                if (error) {
                    this.logger.error('Error exporting message', { error, message, voice, tempFilePath });
                    reject(error);
                }
                this.logger.log('Message exported', { message, voice, tempFilePath });
                resolve({
                    message: message,
                    voice: voice,
                    audioFilePath: tempFilePath,
                });
            });
        });
    }
}