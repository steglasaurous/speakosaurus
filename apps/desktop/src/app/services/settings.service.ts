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
  DEFAULT_MALE_VOICE = 'defaultMaleVoice',
  DEFAULT_FEMALE_VOICE = 'defaultFemaleVoice',
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
  PIPER_HTTP_URL = 'piperHttpUrl',
  IGNORED_USERS = 'ignoredUsers',
  STREAMERBOT_ACTION_INTRO = 'streamerbotActionIntro',
  SETUP_COMPLETED = 'setupCompleted',
  FAVOURITE_VOICES = 'favouriteVoices',
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
  STREAMERBOT_ACTION = 'streamerbotAction',
}

export enum SettingGroup {
  GENERAL = 'General',
  DEFAULT_VOICES = 'Default Voices',
  TTS_PROVIDERS = 'TTS Providers',
  INTERNAL = 'Internal',
  STREAMERBOT_ACTIONS = 'StreamerBot Actions',
}

export interface SettingDefinition {
  name: Setting;
  displayName: string;
  /**
   * Used to determine what group to display the setting in (UI)l
   */
  group: string;

  /**
   * To group settings visually in the UI.
   */
  subGroup?: string;
  /**
   * Optional HTML description/instructions for the subgroup.
   * This is typically set on the first setting of a subgroup to provide
   * context and instructions (e.g., how to get an API key).
   */
  subGroupDescription?: string;
  description: string;

  type: SettingType;
  default?: string;
  /**
   * If an enum type, this lists the valid options.
   */
  options?: string[];
  /**
   * If an enum type, this maps option values to their descriptions for display in the UI.
   */
  optionDescriptions?: { [key: string]: string };
  /**
   * If true, the setting value should be displayed as a password field (for API keys, passwords, etc.).
   */
  sensitive?: boolean;
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
      name: Setting.STREAMERBOT_WEBSOCKET_URL,
      displayName: 'StreamerBot WebSocket URL',
      group: SettingGroup.GENERAL,
      description: 'The URL of the streamerbot websocket server. Ex: ws://localhost:8080.  StreamerBot is used to get chat messages and trigger actions and is required for this app to function.',
      type: SettingType.STRING,
      default: 'ws://localhost:8080',
      required: true,
    },
    {
      name: Setting.MODE,
      displayName: 'TTS Mode',
      group: SettingGroup.GENERAL,
      description: 'How TTS should respond to chat messages',
      type: SettingType.ENUM,
      default: 'trigger',
      options: ['trigger', 'off', 'always'],
      optionDescriptions: {
        'trigger': 'only read a message when it contains a trigger command',
        'off': 'no TTS messages should be read',
        'always': 'read all chat messages',
      },
      required: true,
    },
    {
      name: Setting.TRIGGER_COMMANDS,
      displayName: 'Trigger Commands',
      group: SettingGroup.GENERAL,
      description: 'The commands that will trigger TTS - typically start with an ! exclamation ex: !s',
      type: SettingType.ARRAY,
      default: '["!s", "!\\"", "!say"]',
    },
    {
      name: Setting.DEFAULT_VOICE,
      displayName: 'Default Voice',
      group: SettingGroup.DEFAULT_VOICES,
      description: 'The default voice to use for TTS (if pronouns cannot be determined or male/female default voices are not set)',
      type: SettingType.VOICE,
    },
    {
      name: Setting.DEFAULT_INTRO_VOICE,
      displayName: 'Default Intro Voice',
      group: SettingGroup.DEFAULT_VOICES,
      description: 'The default voice to use for intro messages',
      type: SettingType.VOICE,
    },
    {
      name: Setting.DEFAULT_MALE_VOICE,
      displayName: 'Default Male Voice',
      group: SettingGroup.DEFAULT_VOICES,
      description: 'The default voice to use for users with he/him pronouns',
      type: SettingType.VOICE,
    },
    {
      name: Setting.DEFAULT_FEMALE_VOICE,
      displayName: 'Default Female Voice',
      group: SettingGroup.DEFAULT_VOICES,
      description: 'The default voice to use for users with she/her pronouns',
      type: SettingType.VOICE,
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX,
      displayName: 'Chat Message Prefix',
      group: SettingGroup.GENERAL,
      description: 'The prefix to use for chat messages',
      type: SettingType.STRING,
      default: '{ttsName} said,, ',
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER,
      displayName: 'Omit Message Prefix for Same User',
      group: SettingGroup.GENERAL,
      description: 'Whether to omit the message prefix if the same user speaks within the timeout period',
      type: SettingType.BOOLEAN,
      default: 'true',
    },
    {
      name: Setting.CHAT_MESSAGE_PREFIX_OMIT_SAME_USER_TIMEOUT,
      displayName: 'Same User Message Prefix Omission Timeout',
      group: SettingGroup.GENERAL,
      description: 'The timeout period in milliseconds for the same user message prefix omission',
      type: SettingType.NUMBER,
      default: '30000',
    },
    {
      name: Setting.PAUSE_BETWEEN_MESSAGES_MS,
      displayName: 'Pause Between Messages',
      group: SettingGroup.GENERAL,
      description: 'How long to pause between playing messages in milliseconds',
      type: SettingType.NUMBER,
      default: '1', // Set to 1ms which seems reasonable for most cases
    },
    {
      name: Setting.ELEVENLABS_API_KEY,
      displayName: 'ElevenLabs API Key',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'ElevenLabs',
      subGroupDescription: `
        <p>ElevenLabs provides high-quality text-to-speech voices. To use ElevenLabs:</p>
        <ol>
          <li>Visit <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer">elevenlabs.io</a> and create an account</li>
          <li>Navigate to your profile settings</li>
          <li>Copy your API key from the API section</li>
          <li>Paste it in the field below</li>
        </ol>
      `,
      description: 'The API key for the elevenlabs API',
      type: SettingType.STRING,
      sensitive: true,
    },
    {
      name: Setting.TTS_MONSTER_API_KEY,
      displayName: 'TTS Monster API Key',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'TTS Monster',
      subGroupDescription: `
        <p>TTS Monster is a text-to-speech service. To get your API key:</p>
        <ol>
          <li>Visit <a href="https://tts.monster" target="_blank" rel="noopener noreferrer">tts.monster</a></li>
          <li>Sign up or log in to your account</li>
          <li>Go to your account settings or API section</li>
          <li>Copy your API key and paste it below</li>
        </ol>
      `,
      description: 'The API key for the tts.monster API',
      type: SettingType.STRING,
      sensitive: true,
    },
    {
      name: Setting.TWITCH_CLIENT_ID,
      displayName: 'Twitch Client ID',
      default: '6ash2utgzo1hns22mle8v6g21q1qf0',
      group: SettingGroup.INTERNAL,
      description: 'Your Twitch application Client ID. Get one from https://dev.twitch.tv/console/apps',
      type: SettingType.STRING,
    },
    {
      name: Setting.TTS_MONSTER_UNOFFICIAL_USER_ID,
      displayName: 'TTS MonsterUnofficial User ID',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Unofficial TTS Monster',
      subGroupDescription: `
        <p>Unofficial TTS Monster API requires both a User ID and API Key. To obtain these:</p>
        <ol>
          <li>Visit the TTS Monster website or documentation</li>
          <li>Follow the instructions for accessing the unofficial API</li>
          <li>Retrieve your User ID and API Key</li>
          <li>Enter both values in the fields below</li>
        </ol>
      `,
      description: 'The user ID for the tts.monster Unofficial API',
      type: SettingType.STRING,
    },
    {
      name: Setting.TTS_MONSTER_UNOFFICIAL_API_KEY,
      displayName: 'TTS MonsterUnofficial API Key',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Unofficial TTS Monster',
      description: 'The API key for the tts.monster Unofficial API',
      type: SettingType.STRING,
      sensitive: true,
    },
    {
      name: Setting.AZURE_SPEECH_KEY,
      displayName: 'Azure Speech Key',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Azure',
      subGroupDescription: `
        <p>Azure Speech Services provides text-to-speech capabilities. To set up Azure Speech:</p>
        <ol>
          <li>Go to the <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer">Azure Portal</a></li>
          <li>Create a Speech resource or use an existing one</li>
          <li>Copy your Speech Key and Region from the resource overview</li>
          <li>If using a custom endpoint, enter it in the Endpoint field</li>
          <li>Paste your credentials in the fields below</li>
        </ol>
      `,
      description: 'The API key for the Azure Speech API',
      type: SettingType.STRING,
      sensitive: true,
    },
    {
      name: Setting.AZURE_SPEECH_REGION,
      displayName: 'Azure Speech Region',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Azure',
      description: 'The region for the Azure Speech API',
      type: SettingType.STRING,
    },
    {
      name: Setting.AZURE_ENDPOINT,
      displayName: 'Azure Endpoint',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Azure',
      description: 'The endpoint for the Azure Speech API',
      type: SettingType.STRING,
    },
    {
      name: Setting.PIPER_HTTP_URL,
      displayName: 'Piper HTTP server URL',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Piper',
      subGroupDescription: `
        <p>SpeakManager can auto-start a bundled Piper TTS server on <strong>Windows and Linux</strong>
        when this field is left empty. Leave empty to use the bundled server (recommended).</p>
        <p>To use your own Piper HTTP server instead, set the base URL without a trailing path
        (e.g. <code>http://localhost:5000</code>). That stops the bundled server.</p>
        <p>Extra voices: drop matching <code>Name.onnx</code> and <code>Name.onnx.json</code> files into the
        app voices folder under your user data directory
        (<code>…/speakmanager2/piper/voices</code>). They appear in the voice list without restarting the app.</p>
      `,
      description: 'Optional external Piper HTTP URL (empty = bundled Piper)',
      type: SettingType.STRING,
    },
    {
      name: Setting.IGNORED_USERS,
      displayName: 'Ignored Users',
      group: SettingGroup.GENERAL,
      description: 'The users to ignore for TTS',
      type: SettingType.USER_LIST,
      default: '[]',
    },
    {
      name: Setting.STREAMERBOT_ACTION_INTRO,
      displayName: 'StreamerBot Action - Intro',
      group: SettingGroup.STREAMERBOT_ACTIONS,
      description: 'The action to trigger when the user speaks for the first time. Arguments sent are username and message.',
      type: SettingType.STREAMERBOT_ACTION,
    },
    {
      name: Setting.SETUP_COMPLETED,
      displayName: 'Setup Completed',
      group: SettingGroup.INTERNAL,
      description: 'Internal setting to track if initial setup has been completed',
      type: SettingType.BOOLEAN,
      default: 'false',
    },
    {
      name: Setting.FAVOURITE_VOICES,
      displayName: 'Favourite Voices',
      group: SettingGroup.INTERNAL,
      description: 'Voices favourited in the voice picker',
      type: SettingType.JSON,
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

