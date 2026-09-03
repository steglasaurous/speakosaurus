import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'nestjs-drizzle/sqlite';
import * as schema from '../database/schema';
import { SettingDto } from '../dto/setting.dto';
import { eq } from 'drizzle-orm';

// The enums are so that code calling the setting service can use them (vs just arbitrary strings prone to error)
// When defining a new setting, make sure to add it to this enum AND the settingDefinition.
export enum Setting {
  MODE = 'mode',
  DEFAULT_LANGUAGE = 'defaultLanguage',
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
  ELEVENLABS_ENABLED = 'elevenLabsEnabled',
  ELEVENLABS_API_KEY = 'elevenLabsApiKey',
  TTS_MONSTER_ENABLED = 'ttsMonsterEnabled',
  TTS_MONSTER_API_KEY = 'ttsMonsterApiKey',
  TWITCH_CLIENT_ID = 'twitchClientId',
  TTS_MONSTER_UNOFFICIAL_ENABLED = 'ttsMonsterUnofficialEnabled',
  TTS_MONSTER_UNOFFICIAL_USER_ID = 'ttsMonsterUnofficialUserId',
  TTS_MONSTER_UNOFFICIAL_API_KEY = 'ttsMonsterUnofficialApiKey',
  AZURE_ENABLED = 'azureEnabled',
  AZURE_SPEECH_KEY = 'azureSpeechKey',
  AZURE_SPEECH_REGION = 'azureSpeechRegion',
  AZURE_ENDPOINT = 'azureEndpoint',
  PIPER_ENABLED = 'piperEnabled',
  PIPER_USE_BUILT_IN = 'piperUseBuiltIn',
  PIPER_HTTP_URL = 'piperHttpUrl',
  PIPER_CPU_THREADS = 'piperCpuThreads',
  LOG_RENDER_TIMING = 'logRenderTiming',
  IGNORED_USERS = 'ignoredUsers',
  WORD_REPLACEMENTS = 'wordReplacements',
  STREAMERBOT_ACTION_INTRO = 'streamerbotActionIntro',
  SETUP_COMPLETED = 'setupCompleted',
  FAVOURITE_VOICES = 'favouriteVoices',
  CUSTOM_VOICES = 'customVoices',
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
  WORD_REPLACEMENTS = 'wordReplacements',
}

export enum SettingGroup {
  GENERAL = 'General',
  DEFAULT_VOICES = 'Default Voices',
  TTS_PROVIDERS = 'TTS Providers',
  DEBUGGING = 'Debugging',
  INTERNAL = 'Internal',
  STREAMERBOT_ACTIONS = 'StreamerBot Actions',
}

/**
 * ISO 639-1 codes covering languages used by Piper, Azure, and other TTS providers.
 */
const TTS_LANGUAGE_CODES = [
  'af', 'am', 'ar', 'az', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de',
  'el', 'en', 'es', 'et', 'eu', 'fa', 'fi', 'fr', 'ga', 'gl', 'gu', 'he',
  'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'km', 'kn',
  'ko', 'ku', 'lb', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt',
  'my', 'nb', 'ne', 'nl', 'no', 'pl', 'ps', 'pt', 'ro', 'ru', 'sk', 'sl',
  'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi',
  'zh', 'zu',
];

function buildLanguageEnumOptions(): {
  options: string[];
  optionDescriptions: { [key: string]: string };
} {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
  const labeled = TTS_LANGUAGE_CODES.map((code) => ({
    code,
    name: displayNames.of(code) || code,
  }));
  labeled.sort((a, b) => a.name.localeCompare(b.name));
  return {
    options: labeled.map((item) => item.code),
    optionDescriptions: Object.fromEntries(labeled.map((item) => [item.code, item.name])),
  };
}

const LANGUAGE_ENUM_OPTIONS = buildLanguageEnumOptions();

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
   * If true, this boolean is rendered as the subgroup header enable/disable switch
   * instead of as a normal setting row.
   */
  subGroupToggle?: boolean;
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
      name: Setting.DEFAULT_LANGUAGE,
      displayName: 'Default Language',
      group: SettingGroup.GENERAL,
      description:
        'Preferred language for the voice picker. Voices in this language are listed first for each provider.',
      type: SettingType.ENUM,
      default: 'en',
      options: LANGUAGE_ENUM_OPTIONS.options,
      optionDescriptions: LANGUAGE_ENUM_OPTIONS.optionDescriptions,
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
      name: Setting.ELEVENLABS_ENABLED,
      displayName: 'Enabled',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'ElevenLabs',
      description: 'Enable ElevenLabs as a TTS provider',
      type: SettingType.BOOLEAN,
      default: 'false',
      subGroupToggle: true,
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
      name: Setting.TTS_MONSTER_ENABLED,
      displayName: 'Enabled',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'TTS Monster',
      description: 'Enable TTS Monster as a TTS provider',
      type: SettingType.BOOLEAN,
      default: 'false',
      subGroupToggle: true,
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
      name: Setting.TTS_MONSTER_UNOFFICIAL_ENABLED,
      displayName: 'Enabled',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Unofficial TTS Monster',
      description: 'Enable unofficial TTS Monster as a TTS provider',
      type: SettingType.BOOLEAN,
      default: 'false',
      subGroupToggle: true,
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
      name: Setting.AZURE_ENABLED,
      displayName: 'Enabled',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Azure',
      description: 'Enable Azure Speech as a TTS provider',
      type: SettingType.BOOLEAN,
      default: 'false',
      subGroupToggle: true,
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
      name: Setting.PIPER_ENABLED,
      displayName: 'Enabled',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Piper',
      description: 'Enable Piper as a TTS provider',
      type: SettingType.BOOLEAN,
      default: 'false',
      subGroupToggle: true,
    },
    {
      name: Setting.PIPER_USE_BUILT_IN,
      displayName: 'Use built-in Piper instance',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Piper',
      subGroupDescription: `
        <p>Speakosaurus can auto-start a bundled Piper TTS server on <strong>Windows and Linux</strong>.
        Leave <strong>Use built-in Piper instance</strong> enabled (recommended) to run that server.</p>
        <p>To use your own Piper HTTP server instead, turn the checkbox off and set the base URL without a
        trailing path (e.g. <code>http://localhost:5000</code>). Saving then stops the bundled server.</p>
        <p>Extra voices: drop matching <code>Name.onnx</code> and <code>Name.onnx.json</code> files into the
        app voices folder under your user data directory
        (<code>…/Speakosaurus/piper/voices</code>). They appear in the voice list without restarting the app.</p>
      `,
      description: 'Start Speakosaurus’s bundled Piper TTS server instead of an external URL',
      type: SettingType.BOOLEAN,
      default: 'true',
    },
    {
      name: Setting.PIPER_HTTP_URL,
      displayName: 'Piper HTTP server URL',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Piper',
      description: 'External Piper HTTP URL (used when the built-in instance is off)',
      type: SettingType.STRING,
    },
    {
      name: Setting.PIPER_CPU_THREADS,
      displayName: 'CPU threads',
      group: SettingGroup.TTS_PROVIDERS,
      subGroup: 'Piper',
      description:
        'Limits how many CPU threads the built-in Piper server may use. Lower values leave more CPU for games and streaming; synthesis may take longer. Auto uses all cores. Only applies to the built-in instance; saving restarts Piper.',
      type: SettingType.ENUM,
      default: '2',
      options: ['auto', '1', '2', '4'],
      optionDescriptions: {
        auto: 'Use all CPU cores (fastest synthesis, may hitch games)',
        '1': 'One thread (least impact on games)',
        '2': 'Two threads (recommended)',
        '4': 'Four threads',
      },
    },
    {
      name: Setting.LOG_RENDER_TIMING,
      displayName: 'Log message rendering times',
      group: SettingGroup.DEBUGGING,
      description:
        'When enabled, writes per-utterance TTS timings (render, transfer to the renderer, decode) as JSON lines to render-timing.log in the app logs folder under user data (Speakosaurus/logs/render-timing.log). Applies to all voice providers.',
      type: SettingType.BOOLEAN,
      default: 'false',
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
      name: Setting.WORD_REPLACEMENTS,
      displayName: 'Word Replacements',
      group: SettingGroup.GENERAL,
      description: 'Replace words or phrases in incoming chat before TTS. Matching is whole-word and case-insensitive by default. Enable Case sensitive on a rule to match exact casing.',
      type: SettingType.WORD_REPLACEMENTS,
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
    {
      name: Setting.CUSTOM_VOICES,
      displayName: 'Custom Voices',
      group: SettingGroup.INTERNAL,
      description: 'User-saved customized voices with tweak settings',
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

    const dbTrimmed = (name: Setting): string =>
      ((settingsMap.get(name)?.value as string | undefined) ?? '').trim();

    // Build SettingDto[] based on definitions, filling value from db or default/null
    for (const def of this.settingDefinitions) {
      const dbSetting = settingsMap.get(def.name);
      let value = dbSetting?.value ?? def.default ?? null;
      if (def.name === Setting.PIPER_USE_BUILT_IN && !dbSetting) {
        const url = dbTrimmed(Setting.PIPER_HTTP_URL);
        value = url ? 'false' : 'true';
      }
      if (def.subGroupToggle && !dbSetting) {
        value = this.inferProviderEnabled(def.name, dbTrimmed) ? 'true' : (def.default ?? 'false');
      }
      this.settingsMap.set(def.name, {
        ...def,
        value,
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

  private inferProviderEnabled(
    name: Setting,
    dbTrimmed: (setting: Setting) => string,
  ): boolean {
    switch (name) {
      case Setting.ELEVENLABS_ENABLED:
        return !!dbTrimmed(Setting.ELEVENLABS_API_KEY);
      case Setting.TTS_MONSTER_ENABLED:
        return !!dbTrimmed(Setting.TTS_MONSTER_API_KEY);
      case Setting.TTS_MONSTER_UNOFFICIAL_ENABLED:
        return !!(
          dbTrimmed(Setting.TTS_MONSTER_UNOFFICIAL_USER_ID) &&
          dbTrimmed(Setting.TTS_MONSTER_UNOFFICIAL_API_KEY)
        );
      case Setting.AZURE_ENABLED:
        return !!(
          dbTrimmed(Setting.AZURE_SPEECH_KEY) &&
          dbTrimmed(Setting.AZURE_SPEECH_REGION) &&
          dbTrimmed(Setting.AZURE_ENDPOINT)
        );
      case Setting.PIPER_ENABLED:
        return (
          !!dbTrimmed(Setting.PIPER_HTTP_URL) ||
          dbTrimmed(Setting.SETUP_COMPLETED) === 'true'
        );
      default:
        return false;
    }
  }
}

