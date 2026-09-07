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

export function filterSensitiveSettings<T extends { name: string; sensitive?: boolean; value?: unknown }>(
  settings: T[],
): T[] {
  return settings
    .filter((s) => !isSensitiveSetting(s.name))
    .map((s) => {
      if (s.sensitive) {
        return { ...s, value: s.value ? '********' : null };
      }
      return s;
    });
}
