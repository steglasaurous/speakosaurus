import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { app, ipcMain } from 'electron';
import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { Setting, SettingsService } from './settings.service';

export type RenderTimingStage = 'render' | 'transfer' | 'decode' | 'discarded';

export interface RenderTimingEvent {
  id: string;
  stage: RenderTimingStage;
  ms?: number;
  provider?: string;
  voiceId?: string;
  messageChars?: number;
  audioBytes?: number;
  discarded?: boolean;
}

interface AudioTimingIpcPayload {
  timingId?: string;
  stage?: string;
  ms?: number;
}

@Injectable()
export class RenderTimingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderTimingService.name);
  private enabled = false;
  private logDirCreated = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly settingsService: SettingsService) {}

  async onModuleInit(): Promise<void> {
    await this.settingsService.getAllSettings();
    await this.refreshEnabled();
    ipcMain.on('audio:timing', this.onAudioTiming);
  }

  onModuleDestroy(): void {
    ipcMain.removeListener('audio:timing', this.onAudioTiming);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async refreshEnabled(): Promise<void> {
    const setting = await this.settingsService.getSetting(
      Setting.LOG_RENDER_TIMING,
    );
    this.enabled = setting?.value === 'true';
  }

  getLogFilePath(): string {
    return join(app.getPath('userData'), 'logs', 'render-timing.log');
  }

  log(event: RenderTimingEvent): void {
    if (!this.enabled) {
      return;
    }
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ...event,
      }) + '\n';
    this.writeQueue = this.writeQueue
      .then(() => this.writeLine(line))
      .catch((err) => {
        this.logger.warn('Failed to write render timing log', err);
      });
  }

  private onAudioTiming = (
    _event: unknown,
    payload: AudioTimingIpcPayload,
  ): void => {
    if (!this.enabled || !payload?.timingId) {
      return;
    }
    const stage: RenderTimingStage =
      payload.stage === 'decode' ||
      payload.stage === 'render' ||
      payload.stage === 'transfer' ||
      payload.stage === 'discarded'
        ? payload.stage
        : 'decode';
    this.log({
      id: payload.timingId,
      stage,
      ms: typeof payload.ms === 'number' ? payload.ms : undefined,
    });
  };

  private async writeLine(line: string): Promise<void> {
    const dir = join(app.getPath('userData'), 'logs');
    if (!this.logDirCreated) {
      await mkdir(dir, { recursive: true });
      this.logDirCreated = true;
    }
    await appendFile(this.getLogFilePath(), line, 'utf8');
  }
}
