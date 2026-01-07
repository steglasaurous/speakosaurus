import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'nestjs-drizzle/sqlite';
import * as schema from '../database/schema';
import { SettingDto } from '../dto/setting.dto';
import { eq } from 'drizzle-orm';

// The enums are so that code calling the setting service can use them (vs just arbitrary strings prone to error)
// When defining a new setting, make sure to add it to this enum AND the settingDefinition.
export enum Setting {
  MODE = 'mode',
  TRIGGER_COMMANDS = 'triggerCommands',
  DEFAULT_VOICE = 'defaultVoice',
  DEFAULT_INTRO_VOICE = 'defaultIntroVoice',
  CHAT_MESSAGE_PREFIX = 'chatMessagePrefix',
  CHAT_MESSAGE_PREFIX_OMIT_SAME_USER = 'chatMessagePrefixOmitSameUser',
  CHAT_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT = 'chatMessagePrefixOmitSameUserTimeout',
  PAUSE_BETWEEN_MESSAGES_MS = 'pauseBetweenMessagesMs',
  STREAMERBOT_WEBSOCKET_URL = 'streamerbotWebsocketUrl',
  ELEVENLABS_API_KEY = 'elevenLabsApiKey',
  TTS_MONSTER_API_KEY = 'ttsMonsterApiKey',
  TWITCH_CLIENT_ID = 'twitchClientId',
  TTS_MONSTER_UNOFFICIAL_USER_ID = 'ttsMonsterUnofficialUserId',
  TTS_MONSTER_UNOFFICIAL_API_KEY = 'ttsMonsterUnofficialApiKey',
  AZURE_SPEECH_KEY = 'azureSpeechKey',
  AZURE_SPEECH_REGION = 'azureSpeechRegion',
  AZURE_ENDPOINT = 'azureEndpoint',
  IGNORED_USERS = 'ignoredUsers',
}

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  JSON = 'json',
  ENUM = 'enum',
  // This will render a voice selector in the UI.
  VOICE = 'voice',
  USER_LIST = 'userList',
}

export interface SettingDefinition {
  name: Setting;
  displayName: string;
  /**
   * Used to determine what group to display the setting in (UI)l
   */
  group: string;
  description: string;

  type: SettingType;
  default?: string;
  /**
   * If an enum type, this lists the valid options.
   */
  options?: string[];
  required?: boolean;
  /**
   * The value of the setting in the database, if present. Otherwise is populated by default, if set.
   */
  value?: string;
}

@Injectable()
export class SettingsService {
  // Consider typing these as SettingDto objects? Just make sure the API interface can only modify the value part.
  private settingDefinitions: SettingDefinition[] = [
    {
      name: Setting.MODE,
      displayName: 'TTS Mode',
      group: 'General',
      description: 'How TTS should respond to chat messages',
      type: SettingType.ENUM,
      default: 'trigger',
      options: ['trigger', 'off', 'always'],
      required: true,
    },
    {
      name: Setting.TRIGGER_COMMANDS,
      displayName: 'Trigger Commands',
      group: 'General',
      description: 'The commands that will trigger TTS - typically start with an ! excalamation ex: !s',
      type: SettingType.ARRAY,
      default: '["!s", "!\\"", "!say"]',
    },
    {
      name: Setting.DEFAULT_VOICE,
      displayName: 'Default Voice',
      group: 'General',
      description: 'The default voice to use for TTS',
      type: SettingType.VOICE,
    },
    {
      name: Setting.DEFAULT_INTRO_VOICE,
      displayName: 'Default Intro Voice',
      group: 'General',
      description: 'The default voice to use for intro messages',
      type: SettingType.VOICE,
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX,
      displayName: 'Chat Message Prefix',
      group: 'General',
      description: 'The prefix to use for chat messages',
      type: SettingType.STRING,
      default: '{ttsName} said,, ',
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER,
      displayName: 'Omit Message Prefix for Same User',
      group: 'General',
      description: 'Whether to omit the message prefix if the same user speaks within the timeout period',
      type: SettingType.BOOLEAN,
      default: 'true',
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT,
      displayName: 'Same User Message Prefix Omission Timeout',
      group: 'General',
      description: 'The timeout period in milliseconds for the same user message prefix omission',
      type: SettingType.NUMBER,
      default: '30000',
    },
    {
      name: Setting.PAUSE_BETWEEN_MESSAGES_MS,
      displayName: 'Pause Between Messages',
      group: 'General',
      description: 'How long to pause between playing messages in milliseconds',
      type: SettingType.NUMBER,
      default: '1000',
    },
    {
      name: Setting.STREAMERBOT_WEBSOCKET_URL,
      displayName: 'StreamerBot WebSocket URL',
      group: 'Streaming',
      description: 'The URL of the streamerbot websocket server. Ex: ws://localhost:8080',
      type: SettingType.STRING,
      default: 'ws://localhost:8080',
      required: true,
    },
    {
      name: Setting.ELEVENLABS_API_KEY,
      displayName: 'ElevenLabs API Key',
      group: 'TTS Providers',
      description: 'The API key for the elevenlabs API',
      type: SettingType.STRING,
    },
    {
      name: Setting.TTS_MONSTER_API_KEY,
      displayName: 'TTS Monster API Key',
      group: 'TTS Providers',
      description: 'The API key for the tts.monster API',
      type: SettingType.STRING,
    },
    {
      name: Setting.TWITCH_CLIENT_ID,
      displayName: 'Twitch Client ID',
      default: '6ash2utgzo1hns22mle8v6g21q1qf0',
      group: 'Twitch',
      description: 'Your Twitch application Client ID. Get one from https://dev.twitch.tv/console/apps',
      type: SettingType.STRING,
    },
    {
      name: Setting.TTS_MONSTER_UNOFFICIAL_USER_ID,
      displayName: 'TTS MonsterUnofficial User ID',
      group: 'TTS Providers',
      description: 'The user ID for the tts.monsterUnofficial API',
      type: SettingType.STRING,
    },
    {
      name: Setting.TTS_MONSTER_UNOFFICIAL_API_KEY,
      displayName: 'TTS MonsterUnofficial API Key',
      group: 'TTS Providers',
      description: 'The API key for the tts.monsterUnofficial API',
      type: SettingType.STRING,
    },
    {
      name: Setting.AZURE_SPEECH_KEY,
      displayName: 'Azure Speech Key',
      group: 'TTS Providers',
      description: 'The API key for the Azure Speech API',
      type: SettingType.STRING,
    },
    {
      name: Setting.AZURE_SPEECH_REGION,
      displayName: 'Azure Speech Region',
      group: 'TTS Providers',
      description: 'The region for the Azure Speech API',
      type: SettingType.STRING,
    },
    {
      name: Setting.AZURE_ENDPOINT,
      displayName: 'Azure Endpoint',
      group: 'TTS Providers',
      description: 'The endpoint for the Azure Speech API',
      type: SettingType.STRING,
    },
    {
      name: Setting.IGNORED_USERS,
      displayName: 'Ignored Users',
      group: 'General',
      description: 'The users to ignore for TTS',
      type: SettingType.USER_LIST,
      default: '[]',
    },
  ];

  private settingsMap: Map<Setting, SettingDto> = new Map<Setting, SettingDto>();

  constructor(
    private readonly drizzleService: DrizzleService<typeof schema>,
  ) {
    this.getAllSettings();
  }

  async getAllSettings(): Promise<SettingDto[]> {
    if (this.settingsMap.size > 0) {
      return Array.from(this.settingsMap.values());
    }

    const settings = await this.drizzleService.db
      .select()
      .from(schema.settings as any);
    // Map settings in DB by name for quick lookup
    const settingsMap = new Map<Setting, any>();
    for (const setting of settings) {
      settingsMap.set(setting.name as Setting, setting);
    }

    // Build SettingDto[] based on definitions, filling value from db or default/null
    for (const def of this.settingDefinitions) {
      const dbSetting = settingsMap.get(def.name);
      this.settingsMap.set(def.name, {
        ...def,
        value: dbSetting?.value ?? def.default ?? null,
      });
    }

    return Array.from(this.settingsMap.values());
  }

  async getSetting(name: string): Promise<SettingDto | null> {
    const setting = this.settingsMap.get(name as Setting);
    if (setting) {
      return setting;
    }

    return null;
  }

  async setSetting(name: string, value: string): Promise<SettingDto> {
    const setting = this.settingsMap.get(name as Setting);
    if (!setting) {
      throw new Error(`Setting with name '${name}' not found`);
    }
    
    // FIXME: Validate value against setting type and options
    setting.value = value;

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
    } else {
      // Create new setting if it doesn't exist
      const [created] = await this.drizzleService.db
        .insert(schema.settings as any)
        .values({
          name,
          value,
        })
        .returning();
    }

    return setting;
  }

  async deleteSetting(name: string): Promise<void> {
    const setting = this.settingsMap.get(name as Setting);
    if (!setting) {
      throw new Error(`Setting with name '${name}' not found`);
    }

    setting.value = setting.default ?? null;

    await this.drizzleService.db
      .delete(schema.settings as any)
      .where(eq(schema.settings.name, name) as any);
  }
}

