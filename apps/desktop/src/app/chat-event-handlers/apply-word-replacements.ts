export interface WordReplacement {
  from: string;
  to: string;
  caseSensitive: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordReplacement(item: unknown): item is WordReplacement {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const candidate = item as Partial<WordReplacement>;
  return typeof candidate.from === 'string' && typeof candidate.to === 'string';
}

export function parseWordReplacements(value: string | null | undefined): WordReplacement[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isWordReplacement).map((item) => ({
      from: item.from,
      to: item.to,
      caseSensitive: item.caseSensitive === true,
    }));
  } catch {
    return [];
  }
}

/**
 * Replace whole words/phrases in a chat message. Matching is case-insensitive
 * unless a rule sets caseSensitive. Match text is treated as a literal string.
 */
export function applyWordReplacements(message: string, replacements: WordReplacement[]): string {
  let result = message;
  for (const replacement of replacements) {
    const from = replacement.from;
    if (!from) {
      continue;
    }
    const flags = replacement.caseSensitive ? 'gu' : 'giu';
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(from)}(?![\\p{L}\\p{N}_])`,
      flags
    );
    result = result.replace(pattern, replacement.to);
  }
  return result;
}
