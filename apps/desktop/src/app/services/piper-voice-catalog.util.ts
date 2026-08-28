import { Voice } from './voice-providers/voice.interface';

export interface PiperCatalogVoiceEntry {
  download_urls: string[];
}

export interface PiperCatalogSource {
  name: string;
  reference: string;
  voices: Record<string, PiperCatalogVoiceEntry>;
}

export interface PiperVoiceCatalog {
  voice_sources: PiperCatalogSource[];
}

export interface ParsedPiperVoiceId {
  voiceId: string;
  language?: string;
  locale?: string;
  displayName: string;
  group?: string;
}

const LOCALE_TOKEN = /^[a-z]{2,3}(_[A-Za-z]{2,3})?$/i;

export function stripPiperOnnxSuffix(voiceId: string): string {
  return voiceId.replace(/\.onnx$/i, '');
}

/**
 * Parse a Piper voice id of the form `locale-name-complexity`
 * (e.g. `en_US-kareem-low`). Keys may include a trailing `.onnx`.
 */
export function parsePiperVoiceId(rawId: string): ParsedPiperVoiceId {
  const voiceId = stripPiperOnnxSuffix(rawId);
  const parts = voiceId.split('-');
  if (parts.length < 3 || !LOCALE_TOKEN.test(parts[0])) {
    return { voiceId, displayName: voiceId };
  }

  const localeToken = parts[0];
  const [langPart, regionPart] = localeToken.split('_');
  const language = langPart.toLowerCase();
  const locale = regionPart
    ? `${language}-${regionPart.toUpperCase()}`
    : language;
  const displayName = parts.slice(1).join(' — ');

  return {
    voiceId,
    language,
    locale,
    displayName,
    group: localeToken,
  };
}

export function normalizePiperDownloadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'huggingface.co' ||
      parsed.hostname === 'hf.co'
    ) {
      parsed.pathname = parsed.pathname.replace(/\/blob\//, '/resolve/');
      return parsed.toString();
    }

    if (parsed.hostname === 'github.com') {
      const match = parsed.pathname.match(
        /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
      );
      if (match) {
        const [, owner, repo, ref, path] = match;
        return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
      }
    }

    return url;
  } catch {
    return url;
  }
}

export type PiperDownloadKind = 'onnx' | 'onnx.json';

export function classifyPiperDownloadUrl(url: string): PiperDownloadKind | null {
  const normalized = normalizePiperDownloadUrl(url);
  let pathname = normalized;
  try {
    pathname = new URL(normalized).pathname;
  } catch {
    // use raw string
  }
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.onnx.json')) {
    return 'onnx.json';
  }
  if (lower.endsWith('.onnx')) {
    return 'onnx';
  }
  if (lower.endsWith('.json')) {
    return 'onnx.json';
  }
  return null;
}

export interface PiperDownloadTarget {
  kind: PiperDownloadKind;
  url: string;
  filename: string;
}

export function piperDownloadTargets(
  voiceId: string,
  urls: string[],
): PiperDownloadTarget[] {
  const id = stripPiperOnnxSuffix(voiceId);
  const seen = new Set<PiperDownloadKind>();
  const targets: PiperDownloadTarget[] = [];

  for (const rawUrl of urls) {
    const url = normalizePiperDownloadUrl(rawUrl);
    const kind = classifyPiperDownloadUrl(url);
    if (!kind || seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    targets.push({
      kind,
      url,
      filename: kind === 'onnx' ? `${id}.onnx` : `${id}.onnx.json`,
    });
  }

  return targets;
}

export function catalogVoiceFromId(
  voiceId: string,
  source: Pick<PiperCatalogSource, 'name' | 'reference'>,
  needsDownload: boolean,
): Voice {
  const parsed = parsePiperVoiceId(voiceId);
  return {
    providerName: 'piper',
    voiceId: parsed.voiceId,
    voiceName: parsed.voiceId,
    displayName: parsed.displayName,
    language: parsed.language,
    locale: parsed.locale,
    group: parsed.group,
    needsDownload: needsDownload || undefined,
    catalogSource: {
      name: source.name,
      reference: source.reference,
    },
  };
}

/**
 * Merge Piper HTTP/local voices with the packaged catalog.
 * Local voices win on metadata. Catalog ids already installed
 * (in `localVoices` or `extraInstalledIds`) get no download indicator.
 * Duplicate catalog keys: first source wins.
 */
export function mergePiperCatalog(
  localVoices: Voice[],
  catalog: PiperVoiceCatalog | null | undefined,
  extraInstalledIds: Iterable<string> = [],
): Voice[] {
  const localById = new Map<string, Voice>();
  for (const voice of localVoices) {
    localById.set(stripPiperOnnxSuffix(voice.voiceId), voice);
  }

  const installed = new Set<string>([
    ...localById.keys(),
    ...[...extraInstalledIds].map(stripPiperOnnxSuffix),
  ]);

  const merged: Voice[] = [...localVoices];
  const seenCatalogIds = new Set<string>();

  for (const source of catalog?.voice_sources ?? []) {
    for (const rawId of Object.keys(source.voices ?? {})) {
      const voiceId = stripPiperOnnxSuffix(rawId);
      if (!voiceId || seenCatalogIds.has(voiceId)) {
        continue;
      }
      seenCatalogIds.add(voiceId);

      if (localById.has(voiceId)) {
        continue;
      }

      merged.push(
        catalogVoiceFromId(voiceId, source, !installed.has(voiceId)),
      );
    }
  }

  merged.sort((a, b) =>
    (a.voiceName || a.voiceId).localeCompare(b.voiceName || b.voiceId),
  );
  return merged;
}

export function findCatalogEntry(
  catalog: PiperVoiceCatalog | null | undefined,
  voiceId: string,
): { source: PiperCatalogSource; entry: PiperCatalogVoiceEntry } | null {
  const id = stripPiperOnnxSuffix(voiceId);
  for (const source of catalog?.voice_sources ?? []) {
    const voices = source.voices ?? {};
    const direct = voices[id] ?? voices[`${id}.onnx`];
    if (direct) {
      return { source, entry: direct };
    }
    for (const [key, entry] of Object.entries(voices)) {
      if (stripPiperOnnxSuffix(key) === id) {
        return { source, entry };
      }
    }
  }
  return null;
}
