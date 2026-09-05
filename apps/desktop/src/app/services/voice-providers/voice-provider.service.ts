import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { VOICE_PROVIDERS } from "../../injection-tokens";
import { VoiceProvider } from "./voice-provider.interface";
import { Voice } from "./voice.interface";
import { AudioData } from "./audio-data.interface";
import { AudioProcessorService } from "../audio-processor.service";
import { Setting, SettingsService } from "../settings.service";
import { ElevenLabsVoiceProvider } from "./providers/elevenlabs.voice-provider";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { TTSMonsterVoiceProvider } from "./providers/tts-monster.voice-provider";
import { HttpService } from "@nestjs/axios";
import { TTSMonsterUnofficialVoiceProvider } from "./providers/tts-monster-unofficial.voice-provider";
import { AzureVoiceProvider } from "./providers/azure.voice-provider";
import { PiperVoiceProvider } from "./providers/piper.voice-provider";
import { StatusEventService } from "../status-event.service";
import { PiperHttpServerService } from "../piper-http-server.service";
import { CustomVoicesService } from "../custom-voices.service";
import { VoiceTweakSettings } from "./voice-tweak-settings.interface";
import { PiperVoiceCatalogService } from "../piper-voice-catalog.service";
import { stripPiperOnnxSuffix } from "../piper-voice-catalog.util";
import { RenderTimingService } from "../render-timing.service";
import { statSync } from "fs";
import { v4 as uuid } from "uuid";

@Injectable()
export class VoiceProviderService implements OnModuleInit {
    private cachedVoices: Voice[] | null = null;
    private voiceCacheGeneration = 0;
    private logger: Logger = new Logger(VoiceProviderService.constructor.name);
    private voiceProviders: VoiceProvider[] = [];
    private pendingMessages = 0;
    private piperProviderUpdate: Promise<void> = Promise.resolve();

    constructor(
        @Inject(VOICE_PROVIDERS) private readonly initialVoiceProviders: VoiceProvider[],
        private readonly audioProcessorService: AudioProcessorService,
        private readonly settingsService: SettingsService,
        private readonly httpService: HttpService,
        private readonly statusEventService: StatusEventService,
        private readonly piperHttpServerService: PiperHttpServerService,
        private readonly customVoicesService: CustomVoicesService,
        private readonly piperVoiceCatalogService: PiperVoiceCatalogService,
        private readonly renderTimingService: RenderTimingService,
    ) {
        // Start with the initial providers (typically just SpeakerttsVoiceProvider)
        this.voiceProviders = [...this.initialVoiceProviders];
    }

    async onModuleInit() {
        await this.settingsService.getAllSettings();
        await this.updateElevenLabsProvider();
        await this.updateTTSMonsterProvider();
        await this.updateTTSMonsterUnofficialProvider();
        await this.updateAzureProvider();
        await this.updatePiperProvider();
    }

    async getStockVoices(forceReload = false): Promise<Voice[]> {
        // Return cached result if available and not forcing reload
        if (this.cachedVoices !== null && !forceReload) {
            return this.cachedVoices;
        }

        const generation = ++this.voiceCacheGeneration;
        const output: Voice[] = [];
        for (const provider of this.voiceProviders) {
            let voices: Voice[] = [];
            try {
                voices = await provider.getVoices();
            } catch (error) {
                this.logger.error(`Failed to get voices from provider ${provider.providerName}`, error);
                continue;
            }
            
            for (const voice of voices) {
                output.push(voice);
            }
        }

        // Sort the voices by provider name then voice name
        output.sort((a, b) => {
            if (a.providerName === b.providerName) {
                return a.voiceName.localeCompare(b.voiceName);
            }
            return a.providerName.localeCompare(b.providerName);
        });

        if (generation === this.voiceCacheGeneration) {
            this.cachedVoices = output;
        }
        return output;
    }

    async getVoices(forceReload = false): Promise<Voice[]> {
        const stock = await this.getStockVoices(forceReload);
        const custom = await this.customVoicesService.toVoices(stock);
        const registered = new Set(this.voiceProviders.map((provider) => provider.providerName));
        return [
            ...stock,
            ...custom.filter((voice) => registered.has(voice.providerName)),
        ];
    }

    async getStockVoice(voiceId: string, providerName: string): Promise<Voice | null> {
        const voices = await this.getStockVoices();
        return voices.find(v => v.voiceId === voiceId && v.providerName === providerName) || null;
    }

    async getVoice(voiceId: string, providerName: string): Promise<Voice | null> {
        const voices = await this.getVoices();
        const matches = voices.filter(
            (v) => v.voiceId === voiceId && v.providerName === providerName,
        );
        return matches.find((v) => !v.needsDownload) ?? matches[0] ?? null;
    }

    async getRenderedMessage(
        voice: Voice,
        message: string,
        tweaksOverride?: VoiceTweakSettings,
        allowFallback = true,
    ): Promise<AudioData> {
        const provider = this.voiceProviders.find(p => p.providerName === voice.providerName);
        
        if (!provider) {
            if (!allowFallback) {
                throw new Error(`Voice provider '${voice.providerName}' not found`);
            }
            this.logger.warn(
                `Voice provider '${voice.providerName}' is not registered; falling back to the default voice`,
                { voiceId: voice.voiceId, providerName: voice.providerName },
            );
            const fallback = await this.getDefaultVoice();
            return this.getRenderedMessage(fallback, message, undefined, false);
        }

        if (this.isVoiceUnavailable(voice)) {
            throw new Error(
                `Piper voice '${voice.voiceId}' must be downloaded before it can be used`,
            );
        }

        const engineVoiceId = voice.isCustom && voice.baseVoiceId
            ? voice.baseVoiceId
            : voice.voiceId;
        const tweaks = tweaksOverride ?? voice.tweaks;
        const renderVoice: Voice = {
            ...voice,
            voiceId: engineVoiceId,
            tweaks,
        };

        this.logger.log('Getting rendered message', { message, voice: renderVoice });
        this.pendingMessages++;
        this.statusEventService.emitStatusUpdate({ 
            pendingMessages: this.pendingMessages 
        });
        const timingEnabled = this.renderTimingService.isEnabled();
        const timingId = timingEnabled ? uuid() : undefined;
        const renderStarted = timingEnabled ? Date.now() : 0;
        try {
            const audioData = await provider.getRenderedMessage(message, renderVoice);
            this.pendingMessages--;
            this.statusEventService.emitStatusUpdate({ 
                pendingMessages: this.pendingMessages 
            });
            if (timingId) {
                let audioBytes: number | undefined;
                try {
                    audioBytes = statSync(audioData.audioFilePath).size;
                } catch {
                    // Temp file may already be gone; omit size.
                }
                this.renderTimingService.log({
                    id: timingId,
                    stage: 'render',
                    provider: voice.providerName,
                    voiceId: renderVoice.voiceId,
                    messageChars: message.length,
                    audioBytes,
                    ms: Date.now() - renderStarted,
                });
            }
            return {
                ...audioData,
                voice,
                volume: tweaks?.volume,
                timingId,
            };
        } catch (error) {
            this.pendingMessages--;
            this.statusEventService.emitStatusUpdate({ 
                pendingMessages: this.pendingMessages 
            });
            throw error;
        }
    }

    /**
     * A convenience method to render a message and immediately add it to the audio processor queue.
     * @param voice 
     * @param message 
     */
    async speak(voice: Voice, message: string) {
        const audioData = await this.getRenderedMessage(voice, message);
        await this.audioProcessorService.addToQueue(audioData);
    }

    withAssignmentTweaks(voice: Voice, tweaks?: VoiceTweakSettings | null): Voice {
        return {
            ...voice,
            tweaks: tweaks ?? voice.tweaks,
        };
    }

    /**
     * Return the default voice to use in cases where no specific voice is specified.
     * 
     * A default voice is chosen as follows:
     * - If defaultVoice in settings is present, that is used.
     * - If no defaultVoice is present, the first available voice from speakertts is used.
     * - If no speakertts voices are available, use the first available voice from any provider.
     * - If no voices are available, throw an error.
     */
    async getDefaultVoice(): Promise<Voice> {
        const defaultVoiceSetting = await this.settingsService.getSetting(Setting.DEFAULT_VOICE);
        if (defaultVoiceSetting?.value) {
            const configured = await this.voiceFromSettingJson(defaultVoiceSetting.value);
            if (configured && !this.isVoiceUnavailable(configured)) {
                return configured;
            }
        }

        const voices = (await this.getVoices()).filter(
            (voice) => !this.isVoiceUnavailable(voice),
        );
        for (const voice of voices) {
            if (voice.providerName === 'speakertts') {
                return voice;
            }
        }

        if (voices.length > 0) {
            return voices[0];
        }

        throw new Error('No voices are available - configure at least one voice provider');
    }

    /**
     * Return the configured gendered default voice for supported pronouns.
     * A null result signals that the caller should use the global default.
     */
    async getPronounDefaultVoice(pronouns?: string): Promise<Voice | null> {
        let settingName: Setting;
        if (pronouns === 'hehim') {
            settingName = Setting.DEFAULT_MALE_VOICE;
        } else if (pronouns === 'sheher') {
            settingName = Setting.DEFAULT_FEMALE_VOICE;
        } else {
            return null;
        }

        const setting = await this.settingsService.getSetting(settingName);
        if (!setting?.value) {
            return null;
        }

        try {
            const voice = await this.voiceFromSettingJson(setting.value);
            if (!voice || this.isVoiceUnavailable(voice)) {
                return null;
            }
            return voice;
        } catch (error) {
            this.logger.warn(
                `Failed to resolve ${settingName}; falling back to the global default voice`,
                error,
            );
            return null;
        }
    }

    async voiceFromSettingJson(value: string): Promise<Voice | null> {
        const configuredVoice = JSON.parse(value) as {
            voiceId?: string;
            providerName?: string;
            tweaks?: VoiceTweakSettings;
        };
        if (!configuredVoice.voiceId || !configuredVoice.providerName) {
            return null;
        }

        const voice = await this.getVoice(
            configuredVoice.voiceId,
            configuredVoice.providerName,
        );
        if (!voice) {
            return null;
        }
        return this.withAssignmentTweaks(voice, configuredVoice.tweaks);
    }

    /**
     * Update the ElevenLabs provider based on whether it is enabled and the API key is set.
     * This method is called on module init and when related settings change.
     */
    async updateElevenLabsProvider(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            provider => provider.providerName !== 'elevenlabs'
        );

        if (!(await this.isSettingTrue(Setting.ELEVENLABS_ENABLED))) {
            this.logger.log('ElevenLabs provider not added - disabled');
            this.invalidateVoiceCache();
            return;
        }

        const apiKeySetting = await this.settingsService.getSetting(Setting.ELEVENLABS_API_KEY);
        const apiKey = apiKeySetting?.value;

        if (apiKey && apiKey.trim() !== '') {
            try {
                const elevenLabsClient = new ElevenLabsClient({
                    apiKey: apiKey,
                });
                const elevenLabsProvider = new ElevenLabsVoiceProvider(elevenLabsClient);
                this.voiceProviders.push(elevenLabsProvider);
                this.logger.log('ElevenLabs provider added');
                this.invalidateVoiceCache();
            } catch (error) {
                this.logger.error('Failed to initialize ElevenLabs provider', error);
                this.invalidateVoiceCache();
            }
        } else {
            this.logger.log('ElevenLabs provider not added - API key not set');
            this.invalidateVoiceCache();
        }
    }

    async updateTTSMonsterProvider(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            provider => provider.providerName !== 'ttsMonster'
        );

        if (!(await this.isSettingTrue(Setting.TTS_MONSTER_ENABLED))) {
            this.logger.log('TTS Monster provider not added - disabled');
            this.invalidateVoiceCache();
            return;
        }

        const apiKeySetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_API_KEY);
        const apiKey = apiKeySetting?.value;
        if (apiKey && apiKey.trim() !== '') {
            const ttsMonsterProvider = new TTSMonsterVoiceProvider(apiKey, this.httpService);
            this.voiceProviders.push(ttsMonsterProvider);
            this.logger.log('TTS Monster provider added');
            this.invalidateVoiceCache();
        } else {
            this.logger.log('TTS Monster provider not added - API key not set');
            this.invalidateVoiceCache();
        }
    }

    async updateTTSMonsterUnofficialProvider(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            provider => provider.providerName !== 'ttsMonsterUnofficial'
        );

        if (!(await this.isSettingTrue(Setting.TTS_MONSTER_UNOFFICIAL_ENABLED))) {
            this.logger.log('TTS MonsterUnofficial provider not added - disabled');
            this.invalidateVoiceCache();
            return;
        }

        const userIdSetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_UNOFFICIAL_USER_ID);
        const userId = userIdSetting?.value;
        const apiKeySetting = await this.settingsService.getSetting(Setting.TTS_MONSTER_UNOFFICIAL_API_KEY);
        const apiKey = apiKeySetting?.value;
        if (userId && apiKey && userId.trim() !== '' && apiKey.trim() !== '') {
            const ttsMonsterUnofficialProvider = new TTSMonsterUnofficialVoiceProvider(userId, apiKey, this.httpService);
            this.voiceProviders.push(ttsMonsterUnofficialProvider);
            this.invalidateVoiceCache();
            this.logger.log('TTS MonsterUnofficial provider added');
        } else {
            this.logger.log('TTS MonsterUnofficial provider not added - user ID or API key not set');
            this.invalidateVoiceCache();
        }
    }

    async updateAzureProvider(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            provider => provider.providerName !== 'azure'
        );

        if (!(await this.isSettingTrue(Setting.AZURE_ENABLED))) {
            this.logger.log('Azure provider not added - disabled');
            this.invalidateVoiceCache();
            return;
        }

        const apiKeySetting = await this.settingsService.getSetting(Setting.AZURE_SPEECH_KEY);
        const apiKey = apiKeySetting?.value;
        const regionSetting = await this.settingsService.getSetting(Setting.AZURE_SPEECH_REGION);
        const region = regionSetting?.value;
        const endpointSetting = await this.settingsService.getSetting(Setting.AZURE_ENDPOINT);
        const endpoint = endpointSetting?.value;
        if (apiKey && region && endpoint && apiKey.trim() !== '' && region.trim() !== '' && endpoint.trim() !== '') {
            const azureProvider = new AzureVoiceProvider(apiKey, region, endpoint);
            this.voiceProviders.push(azureProvider);
            this.invalidateVoiceCache();
            this.logger.log('Azure provider added');
        } else {
            this.logger.log('Azure provider not added - API key, region, or endpoint not set');
            this.invalidateVoiceCache();
        }
    }

    /**
     * Add or remove the Piper provider.
     * {@link Setting.PIPER_USE_BUILT_IN} starts the bundled managed server.
     * Otherwise a non-empty {@link Setting.PIPER_HTTP_URL} uses an external server
     * (managed child stopped). Concurrent calls are serialized.
     */
    async updatePiperProvider(): Promise<void> {
        this.piperProviderUpdate = this.piperProviderUpdate
            .catch(() => undefined)
            .then(() => this.updatePiperProviderInternal());
        return this.piperProviderUpdate;
    }

    private async updatePiperProviderInternal(): Promise<void> {
        this.voiceProviders = this.voiceProviders.filter(
            (p) => p.providerName !== 'piper',
        );

        if (!(await this.isSettingTrue(Setting.PIPER_ENABLED))) {
            await this.piperHttpServerService.stop();
            this.invalidateVoiceCache();
            this.logger.log('Piper provider not added - disabled');
            return;
        }

        const useBuiltInSetting = await this.settingsService.getSetting(
            Setting.PIPER_USE_BUILT_IN,
        );
        const useBuiltIn = useBuiltInSetting?.value !== 'false';
        const urlSetting = await this.settingsService.getSetting(Setting.PIPER_HTTP_URL);
        const externalUrl = urlSetting?.value?.trim();

        if (useBuiltIn) {
            const threadCapSetting = await this.settingsService.getSetting(
                Setting.PIPER_CPU_THREADS,
            );
            const managedUrl = await this.piperHttpServerService.ensureStarted(
                threadCapSetting?.value,
            );
            if (managedUrl) {
                const piperProvider = new PiperVoiceProvider(
                    managedUrl,
                    this.httpService,
                    this.piperVoiceCatalogService,
                );
                this.voiceProviders.push(piperProvider);
                this.invalidateVoiceCache();
                this.logger.log('Piper provider added (bundled managed server)', {
                    baseUrl: managedUrl,
                    voicesDir: this.piperHttpServerService.getVoicesDirectory(),
                });
                return;
            }

            this.invalidateVoiceCache();
            this.logger.log(
                'Piper provider not added — built-in instance requested but bundled runtime unavailable',
            );
            return;
        }

        await this.piperHttpServerService.stop();

        if (externalUrl) {
            const piperProvider = new PiperVoiceProvider(
                externalUrl,
                this.httpService,
                this.piperVoiceCatalogService,
            );
            this.voiceProviders.push(piperProvider);
            this.invalidateVoiceCache();
            this.logger.log('Piper provider added (external URL)', { baseUrl: externalUrl });
            return;
        }

        this.invalidateVoiceCache();
        this.logger.log(
            'Piper provider not added — built-in instance off and no external URL',
        );
    }

    /**
     * Download a Piper catalog voice into the app voices directory, then
     * refresh the voice cache so it appears as installed.
     */
    async downloadPiperVoice(voiceId: string): Promise<Voice> {
        const downloaded = await this.piperVoiceCatalogService.download(voiceId);
        this.invalidateVoiceCache();
        const voices = await this.getVoices(true);
        const id = stripPiperOnnxSuffix(voiceId);
        const found = voices.find(
            (voice) =>
                voice.providerName === 'piper' &&
                stripPiperOnnxSuffix(voice.voiceId) === id,
        );
        if (found && !found.needsDownload) {
            return found;
        }
        return downloaded;
    }

    /**
     * Get the number of messages currently being rendered (pending audio generation)
     */
    getPendingMessagesCount(): number {
        return this.pendingMessages;
    }

    private invalidateVoiceCache(): void {
        this.cachedVoices = null;
        this.voiceCacheGeneration += 1;
    }

    private async isSettingTrue(name: Setting): Promise<boolean> {
        const setting = await this.settingsService.getSetting(name);
        return setting?.value === 'true';
    }

    private isVoiceUnavailable(voice: Voice): boolean {
        if (!voice.needsDownload) {
            return false;
        }
        if (voice.providerName !== 'piper') {
            return true;
        }
        return !this.piperVoiceCatalogService
            .getInstalledVoiceIds()
            .has(stripPiperOnnxSuffix(voice.voiceId));
    }
}