import { Injectable, NotFoundException } from '@nestjs/common';
import { DrizzleService } from 'nestjs-drizzle/sqlite';
import * as schema from '../database/schema';
import { SettingDto } from '../dto/setting.dto';
import { eq } from 'drizzle-orm';

@Injectable()
export class SettingsService {
  static SETTING_MODE = 'mode';
  static SETTING_TRIGGER_COMMANDS = 'triggerCommands';
  static SETTING_DEFAULT_VOICE = 'defaultVoice';
  static SETTING_MESSAGE_PREFIX = 'chatMessagePrefix';

  // If enabled, the message prefix will be omitted if the same user speaks within the timeout period.
  static SETTING_MESSAGE_PREFIX_OMIT_SAME_USER = 'chatMessagePrefixOmitSameUser';
  
  // The timeout period in milliseconds for the same user message prefix omission, in milliseconds.
  static SETTING_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT = 'chatMessagePrefixOmitSameUserTimeout';

  // How long to pause between playing messages in milliseconds.
  static SETTING_PAUSE_BETWEEN_MESSAGES_MS = 'pauseBetweenMessagesMs';

  constructor(
    private readonly drizzleService: DrizzleService<typeof schema>,
  ) {}

  getDefaultSettingValue(name: string): string | null {
    switch (name) {
      case SettingsService.SETTING_MODE:
        return 'trigger';
      case SettingsService.SETTING_TRIGGER_COMMANDS:
        return '["!s", "!\\"", "!say"]';
      case SettingsService.SETTING_MESSAGE_PREFIX:
        return '{ttsName} said,, ';
      case SettingsService.SETTING_MESSAGE_PREFIX_OMIT_SAME_USER:
        return 'true';
      case SettingsService.SETTING_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT:
        return '30000';
      case SettingsService.SETTING_PAUSE_BETWEEN_MESSAGES_MS:
        return '1000';
      default:
        return null;
    }
  }

  async getAllSettings(): Promise<SettingDto[]> {
    const settings = await this.drizzleService.db
      .select()
      .from(schema.settings as any);
    return settings as SettingDto[];
  }

  async getSetting(name: string): Promise<SettingDto | null> {
    const [setting] = await this.drizzleService.db
      .select()
      .from(schema.settings as any)
      .where(eq(schema.settings.name, name) as any)
      .limit(1);

    if (!setting) {
      // See if there's a default value.
      const defaultValue = this.getDefaultSettingValue(name);
      if (defaultValue) {
        return {
          name,
          value: defaultValue,
        } as SettingDto;
      }

      // throw new NotFoundException(`Setting with name '${name}' not found`);
      return null;
    }

    return setting as SettingDto;
  }

  async setSetting(name: string, value: string): Promise<SettingDto> {
    // Check if setting exists
    const [existing] = await this.drizzleService.db
      .select()
      .from(schema.settings as any)
      .where(eq(schema.settings.name, name) as any)
      .limit(1);

    if (existing) {
      // Update existing setting
      const [updated] = await this.drizzleService.db
        .update(schema.settings as any)
        .set({
          value,
        })
        .where(eq(schema.settings.name, name) as any)
        .returning();

      return updated as SettingDto;
    } else {
      // Create new setting if it doesn't exist
      const [created] = await this.drizzleService.db
        .insert(schema.settings as any)
        .values({
          name,
          value,
        })
        .returning();

      return created as SettingDto;
    }
  }

  async deleteSetting(name: string): Promise<void> {
    const [existing] = await this.drizzleService.db
      .select()
      .from(schema.settings as any)
      .where(eq(schema.settings.name, name) as any)
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Setting with name '${name}' not found`);
    }

    await this.drizzleService.db
      .delete(schema.settings as any)
      .where(eq(schema.settings.name, name) as any);
  }
}

