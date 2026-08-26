import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { Setting, SettingsService } from './settings.service';
import {
  CustomVoiceRecord,
  VoiceTweakSettings,
} from './voice-providers/voice-tweak-settings.interface';
import { Voice } from './voice-providers/voice.interface';

@Injectable()
export class CustomVoicesService {
  private readonly logger = new Logger(CustomVoicesService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async list(): Promise<CustomVoiceRecord[]> {
    await this.settingsService.getAllSettings();
    const setting = await this.settingsService.getSetting(Setting.CUSTOM_VOICES);
    if (!setting?.value) {
      return [];
    }
    try {
      const parsed = JSON.parse(setting.value) as CustomVoiceRecord[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((record) => record?.id && record?.providerName && record?.baseVoiceId);
    } catch (error) {
      this.logger.warn('Failed to parse customVoices setting', error);
      return [];
    }
  }

  async getById(id: string): Promise<CustomVoiceRecord | null> {
    const records = await this.list();
    return records.find((record) => record.id === id) ?? null;
  }

  toVoice(record: CustomVoiceRecord, stockVoices: Voice[]): Voice {
    const base = stockVoices.find(
      (voice) => voice.providerName === record.providerName && voice.voiceId === record.baseVoiceId,
    );
    return {
      voiceId: record.id,
      providerName: record.providerName,
      voiceName: record.displayName,
      displayName: record.displayName,
      language: record.language ?? base?.language,
      gender: record.gender ?? base?.gender,
      locale: record.locale ?? base?.locale,
      description: record.description ?? base?.description,
      supportedStyles: record.supportedStyles ?? base?.supportedStyles,
      isCustom: true,
      baseVoiceId: record.baseVoiceId,
      tweaks: record.tweaks ?? {},
    };
  }

  async toVoices(stockVoices: Voice[]): Promise<Voice[]> {
    const records = await this.list();
    return records.map((record) => this.toVoice(record, stockVoices));
  }

  async create(input: {
    displayName: string;
    providerName: string;
    baseVoiceId: string;
    tweaks?: VoiceTweakSettings;
    language?: string;
    gender?: string;
    locale?: string;
    description?: string;
    supportedStyles?: string[];
  }): Promise<CustomVoiceRecord> {
    const record: CustomVoiceRecord = {
      id: uuid(),
      displayName: input.displayName.trim(),
      providerName: input.providerName,
      baseVoiceId: input.baseVoiceId,
      tweaks: input.tweaks ?? {},
      language: input.language,
      gender: input.gender,
      locale: input.locale,
      description: input.description,
      supportedStyles: input.supportedStyles,
    };
    const records = await this.list();
    records.push(record);
    await this.persist(records);
    return record;
  }

  async update(
    id: string,
    patch: { displayName?: string; tweaks?: VoiceTweakSettings },
  ): Promise<CustomVoiceRecord> {
    const records = await this.list();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) {
      throw new NotFoundException(`Custom voice '${id}' not found`);
    }
    const current = records[index];
    const updated: CustomVoiceRecord = {
      ...current,
      displayName: patch.displayName?.trim() || current.displayName,
      tweaks: patch.tweaks ?? current.tweaks,
    };
    records[index] = updated;
    await this.persist(records);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const records = await this.list();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) {
      throw new NotFoundException(`Custom voice '${id}' not found`);
    }
    await this.persist(next);
  }

  private async persist(records: CustomVoiceRecord[]): Promise<void> {
    await this.settingsService.setSetting(Setting.CUSTOM_VOICES, JSON.stringify(records));
  }
}
