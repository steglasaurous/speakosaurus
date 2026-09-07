import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { readFileSync, unlinkSync } from 'fs';
import { extname } from 'path';
import { SettingsService, Setting } from './settings.service';
import { UsersService } from './users.service';
import { AudioProcessorService } from './audio-processor.service';
import { VoiceProviderService } from './voice-providers/voice-provider.service';
import { CustomVoicesService } from './custom-voices.service';
import { StreamerBotManagerService } from './streamer-bot-manager.service';
import { StatusEventService } from './status-event.service';
import { UserEventService } from './user-event.service';
import { TwitchAuthService } from './twitch-auth.service';
import { toVoiceDto } from '../dto/voice-mapper';
import { isSensitiveSetting } from '../remote/sensitive-settings';

export interface BroadcasterCommand {
  type: 'request';
  requestId: string;
  method: string;
  endpoint: string;
  body?: any;
  query?: any;
}

export interface BroadcasterResponse {
  type: 'response';
  requestId: string;
  statusCode: number;
  body?: unknown;
  error?: string;
}

type RequestHandler = (
  body: any,
  query: any,
  endpoint: string,
) => Promise<unknown>;

@Injectable()
export class BridgeClientService implements OnModuleDestroy {
  private readonly logger = new Logger(BridgeClientService.name);
  private socket: Socket | null = null;
  private isConnected = false;
  private connectionToken: string | null = null;
  private bridgeUrl: string | null = null;
  private sessionId: string | null = null;
  private readonly handlers = new Map<string, RequestHandler>();
  private statusSub: { unsubscribe: () => void } | null = null;
  private userSub: { unsubscribe: () => void } | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly audioProcessorService: AudioProcessorService,
    private readonly voiceProviderService: VoiceProviderService,
    private readonly customVoicesService: CustomVoicesService,
    private readonly streamerBotManagerService: StreamerBotManagerService,
    private readonly statusEventService: StatusEventService,
    private readonly userEventService: UserEventService,
    private readonly twitchAuthService: TwitchAuthService,
  ) {
    this.registerHandlers();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  isBridgeConnected(): boolean {
    return this.isConnected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private registerHandlers() {
    this.handlers.set('GET:/users', async (_b, query) => {
      if (query?.query) {
        return this.usersService.searchUsers(String(query.query));
      }
      return this.usersService.getAllUsers();
    });

    this.handlers.set('POST:/users', async (body) => {
      return this.usersService.createUser(body.twitchUserId, body.twitchUsername);
    });

    this.handlers.set('POST:/users/populate-pronouns', async () => {
      return this.usersService.populateMissingPronouns();
    });

    this.handlers.set('GET:/users/:id', async (_b, _q, endpoint) => {
      const id = endpoint.replace(/^\/users\//, '');
      const user = await this.usersService.getUser(id);
      if (!user) {
        throw new Error(`User with Twitch ID '${id}' not found`);
      }
      return user;
    });

    this.handlers.set('PUT:/users/:id', async (body, _q, endpoint) => {
      const id = endpoint.replace(/^\/users\//, '');
      const user = await this.usersService.updateUser(id, body);
      if (!user) {
        throw new Error(`User with Twitch ID '${id}' not found`);
      }
      return user;
    });

    this.handlers.set('POST:/users/:id/intros', async (body, _q, endpoint) => {
      const id = endpoint.replace(/^\/users\//, '').replace(/\/intros$/, '');
      await this.usersService.addCustomIntro(id, body.introText);
      return { success: true, message: 'Custom intro successfully created' };
    });

    this.handlers.set('PUT:/users/intros/:introId', async (body, _q, endpoint) => {
      const introId = endpoint.replace(/^\/users\/intros\//, '');
      await this.usersService.updateCustomIntro(introId, body.introText);
      return { success: true, message: 'Custom intro successfully updated' };
    });

    this.handlers.set('DELETE:/users/intros/:introId', async (_b, _q, endpoint) => {
      const introId = endpoint.replace(/^\/users\/intros\//, '');
      await this.usersService.deleteCustomIntro(introId);
      return { success: true, message: 'Custom intro successfully deleted' };
    });

    this.handlers.set('GET:/twitch/users/search', async (_b, query) => {
      return this.twitchAuthService.searchUsers(String(query?.query || ''));
    });

    this.handlers.set('GET:/twitch/users/by-username', async (_b, query) => {
      return this.twitchAuthService.getUserByUsername(String(query?.username || ''));
    });

    this.handlers.set('GET:/settings', async () => {
      const settings = await this.settingsService.getAllSettings();
      return settings.filter((s) => !isSensitiveSetting(s.name));
    });

    this.handlers.set('GET:/settings/:name', async (_b, _q, endpoint) => {
      const name = endpoint.replace(/^\/settings\//, '');
      if (isSensitiveSetting(name)) {
        throw new Error('Cannot view sensitive settings remotely');
      }
      return this.settingsService.getSetting(name);
    });

    this.handlers.set('PUT:/settings/:name', async (body, _q, endpoint) => {
      const name = endpoint.replace(/^\/settings\//, '');
      if (isSensitiveSetting(name)) {
        throw new Error('Cannot modify sensitive settings remotely');
      }
      return this.settingsService.setSetting(name, body?.value);
    });

    this.handlers.set('GET:/voices', async (_b, query) => {
      const force = query?.forceReload === 'true' || query?.forceReload === '1';
      const voices = await this.voiceProviderService.getVoices(!!force);
      return voices.map(toVoiceDto);
    });

    this.handlers.set('POST:/voices/piper/:id/download', async (_b, _q, endpoint) => {
      const voiceId = endpoint.replace(/^\/voices\/piper\//, '').replace(/\/download$/, '');
      const voice = await this.voiceProviderService.downloadPiperVoice(voiceId);
      return toVoiceDto(voice);
    });

    this.handlers.set('GET:/custom-voices', async () => {
      const records = await this.customVoicesService.list();
      return records.map((record) => ({
        id: record.id,
        displayName: record.displayName,
        providerName: record.providerName,
        baseVoiceId: record.baseVoiceId,
        tweaks: record.tweaks ?? {},
      }));
    });

    this.handlers.set('POST:/custom-voices', async (body) => {
      const base = await this.voiceProviderService.getStockVoice(
        body.baseVoiceId,
        body.providerName,
      );
      if (!base) {
        throw new Error(`Base voice not found`);
      }
      const record = await this.customVoicesService.create({
        displayName: body.displayName || `${base.displayName || base.voiceName} custom`,
        providerName: body.providerName,
        baseVoiceId: body.baseVoiceId,
        tweaks: body.tweaks ?? {},
        language: base.language,
        gender: base.gender,
        locale: base.locale,
        description: base.description,
        supportedStyles: base.supportedStyles,
      });
      const stock = await this.voiceProviderService.getStockVoices();
      return toVoiceDto(this.customVoicesService.toVoice(record, stock));
    });

    this.handlers.set('PUT:/custom-voices/:id', async (body, _q, endpoint) => {
      const id = endpoint.replace(/^\/custom-voices\//, '');
      const record = await this.customVoicesService.update(id, {
        displayName: body.displayName,
        tweaks: body.tweaks,
      });
      const stock = await this.voiceProviderService.getStockVoices();
      return toVoiceDto(this.customVoicesService.toVoice(record, stock));
    });

    this.handlers.set('DELETE:/custom-voices/:id', async (_b, _q, endpoint) => {
      const id = endpoint.replace(/^\/custom-voices\//, '');
      await this.customVoicesService.remove(id);
      return { success: true };
    });

    this.handlers.set('POST:/queue/pause', async () => {
      this.audioProcessorService.pause();
      return { success: true, message: 'Queue paused' };
    });

    this.handlers.set('POST:/queue/resume', async () => {
      this.audioProcessorService.resume();
      return { success: true, message: 'Queue resumed' };
    });

    this.handlers.set('POST:/queue/skip', async () => {
      this.audioProcessorService.skipCurrent();
      return { success: true, message: 'Current message skipped' };
    });

    this.handlers.set('POST:/queue/clear', async () => {
      this.audioProcessorService.clearQueue();
      return { success: true, message: 'Queue cleared' };
    });

    this.handlers.set('GET:/status', async () => {
      const modeSetting = await this.settingsService.getSetting(Setting.MODE);
      return {
        streamerBotConnected: this.streamerBotManagerService.getConnectionStatus(),
        audioQueueSize: this.audioProcessorService.getQueueSize(),
        pendingMessages: this.voiceProviderService.getPendingMessagesCount(),
        mode: modeSetting?.value || modeSetting?.default || 'trigger',
        isPaused: this.audioProcessorService.isPausedState(),
        remoteAccessConnected: this.isConnected,
      };
    });

    this.handlers.set('POST:/speak/preview', async (body) => {
      return this.handleRemotePreview(body);
    });

    this.handlers.set('POST:/speak', async (body) => {
      return this.handleRemoteSpeak(body);
    });

    this.handlers.set('POST:/speak/stop', async () => {
      return this.audioProcessorService.stopAll();
    });
  }

  private async handleRemoteSpeak(body: any) {
    const voice = body.voiceId && body.voiceProvider
      ? await this.voiceProviderService.getVoice(body.voiceId, body.voiceProvider)
      : null;
    const resolved =
      voice ||
      (await this.voiceProviderService.getPronounDefaultVoice(body.pronouns)) ||
      (await this.voiceProviderService.getDefaultVoice());
    if (!resolved) {
      throw new Error('No voice available');
    }
    const audioData = await this.voiceProviderService.getRenderedMessage(
      resolved,
      body.message,
      body.tweaks,
    );
    await this.audioProcessorService.addToQueue(audioData);
    return { success: true, message: 'Message queued for playback on broadcaster' };
  }

  private async handleRemotePreview(body: any) {
    const destination: 'remote' | 'broadcaster' | 'both' = body?.destination || 'remote';
    const voice = await this.voiceProviderService.getVoice(body.voiceId, body.voiceProvider);
    if (!voice) {
      throw new Error(`Voice not found: ${body.voiceProvider}/${body.voiceId}`);
    }

    const audioData = await this.voiceProviderService.getRenderedMessage(
      voice,
      body.message?.trim() || 'This is a test message.',
      body.tweaks,
    );

    const audioBuffer = readFileSync(audioData.audioFilePath);
    const format = extname(audioData.audioFilePath).slice(1).toLowerCase();
    const base64 = audioBuffer.toString('base64');

    try {
      unlinkSync(audioData.audioFilePath);
    } catch {
      // ignore
    }

    if (destination === 'broadcaster' || destination === 'both') {
      await this.audioProcessorService.playBase64Directly({
        base64,
        format,
        message: audioData.message,
        volume: audioData.volume ?? 1,
        voice: {
          providerName: voice.providerName,
          voiceId: voice.voiceId,
          voiceName: voice.voiceName,
          displayName: voice.displayName,
        },
      });
    }

    if (destination === 'remote' || destination === 'both') {
      return {
        success: true,
        message: 'Preview rendered',
        audio: {
          base64,
          format,
          message: audioData.message,
          volume: audioData.volume ?? 1,
          voice: {
            providerName: voice.providerName,
            voiceId: voice.voiceId,
            voiceName: voice.voiceName,
            displayName: voice.displayName,
          },
        },
      };
    }

    return { success: true, message: 'Preview played on broadcaster' };
  }

  private matchHandler(method: string, endpoint: string): RequestHandler | undefined {
    const exact = this.handlers.get(`${method}:${endpoint}`);
    if (exact) {
      return exact;
    }

    for (const [key, handler] of this.handlers.entries()) {
      // Keys are "METHOD:/path/:param" — only split on the first colon so
      // route params like :id are preserved in the pattern.
      const sep = key.indexOf(':');
      if (sep < 0) continue;
      const m = key.slice(0, sep);
      const pattern = key.slice(sep + 1);
      if (m !== method) continue;
      const regex = new RegExp(
        '^' + pattern.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '$',
      );
      if (regex.test(endpoint)) {
        return handler;
      }
    }
    return undefined;
  }

  async connect(bridgeUrl: string, sessionId: string, connectionToken: string): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }

    this.bridgeUrl = bridgeUrl.replace(/\/$/, '');
    this.connectionToken = connectionToken;
    this.sessionId = sessionId;

    const socketUrl = this.bridgeUrl;
    this.socket = io(`${socketUrl}/broadcaster`, {
      auth: { token: connectionToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('command', (command: BroadcasterCommand) => {
      void this.handleCommand(command);
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.logger.warn('Disconnected from bridge');
    });

    this.socket.on('connect', () => {
      this.logger.log('Socket connected to bridge');
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
      this.socket!.once('authenticated', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.logger.log(`Authenticated with bridge session ${sessionId}`);
        this.subscribeEvents();
        resolve();
      });
      this.socket!.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.socket!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  private subscribeEvents() {
    this.statusSub?.unsubscribe();
    this.userSub?.unsubscribe();

    this.statusSub = this.statusEventService.statusUpdates$.subscribe((data) => {
      this.socket?.emit('event', { type: 'event', eventType: 'status', data });
    });
    this.userSub = this.userEventService.userUpdates$.subscribe((data) => {
      this.socket?.emit('event', { type: 'event', eventType: 'users', data });
    });
  }

  private async handleCommand(command: BroadcasterCommand) {
    const handler = this.matchHandler(command.method, command.endpoint);
    let response: BroadcasterResponse;
    try {
      if (!handler) {
        throw new Error(`Endpoint not allowed: ${command.method} ${command.endpoint}`);
      }
      const body = await handler(command.body, command.query, command.endpoint);
      response = {
        type: 'response',
        requestId: command.requestId,
        statusCode: 200,
        body,
      };
    } catch (error) {
      response = {
        type: 'response',
        requestId: command.requestId,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
    this.socket?.emit('response', response);
  }

  async disconnect(): Promise<void> {
    this.statusSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.statusSub = null;
    this.userSub = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.sessionId = null;
    this.connectionToken = null;
  }
}
