export const SENSITIVE_SETTINGS = new Set([
  'elevenLabsApiKey',
  'ttsMonsterApiKey',
  'ttsMonsterUnofficialUserId',
  'ttsMonsterUnofficialApiKey',
  'azureSpeechKey',
  'azureSpeechRegion',
  'azureEndpoint',
  'twitchClientId',
  'streamerbotWebsocketUrl',
  'remoteAccessBridgeUrl',
  'remoteAccessSessionId',
  'remoteAccessConnectionToken',
  'remoteAccessEnabled',
]);

export function isSensitiveSetting(name: string): boolean {
  return SENSITIVE_SETTINGS.has(name);
}
