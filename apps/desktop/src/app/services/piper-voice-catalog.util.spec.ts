import { Voice } from './voice-providers/voice.interface';
import {
  classifyPiperDownloadUrl,
  findCatalogEntry,
  mergePiperCatalog,
  normalizePiperDownloadUrl,
  parsePiperVoiceId,
  piperDownloadTargets,
  stripPiperOnnxSuffix,
  PiperVoiceCatalog,
} from './piper-voice-catalog.util';

const catalog: PiperVoiceCatalog = {
  voice_sources: [
    {
      name: 'simoniz0r/piper-voice-models',
      reference: 'https://github.com/simoniz0r/piper-voice-models/tree/main',
      voices: {
        'en_US-carl-medium': {
          download_urls: [
            'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx',
            'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/carl/medium/en_US-carl-medium.onnx.json',
          ],
        },
        'en_US-kareem-low': {
          download_urls: [
            'https://example.com/en_US-kareem-low.onnx',
            'https://example.com/en_US-kareem-low.onnx.json',
          ],
        },
      },
    },
    {
      name: 'other/source',
      reference: 'https://example.com/other',
      voices: {
        'en_US-carl-medium': {
          download_urls: ['https://example.com/duplicate.onnx'],
        },
      },
    },
  ],
};

function localVoice(voiceId: string): Voice {
  return {
    providerName: 'piper',
    voiceId,
    voiceName: voiceId,
    displayName: `English (United States) — ${voiceId}`,
    language: 'en',
    locale: 'en-US',
  };
}

describe('parsePiperVoiceId', () => {
  it('parses locale-name-complexity into language and ISO locale', () => {
    expect(parsePiperVoiceId('en_US-kareem-low')).toEqual({
      voiceId: 'en_US-kareem-low',
      language: 'en',
      locale: 'en-US',
      displayName: 'kareem — low',
      group: 'en_US',
    });
  });

  it('strips a trailing .onnx suffix', () => {
    expect(parsePiperVoiceId('en_GB-alan-medium.onnx')).toMatchObject({
      voiceId: 'en_GB-alan-medium',
      language: 'en',
      locale: 'en-GB',
      displayName: 'alan — medium',
    });
  });

  it('leaves language and locale unset when the id does not match', () => {
    expect(parsePiperVoiceId('jarvis')).toEqual({
      voiceId: 'jarvis',
      displayName: 'jarvis',
    });
  });
});

describe('normalizePiperDownloadUrl', () => {
  it('rewrites Hugging Face blob URLs to resolve URLs', () => {
    expect(
      normalizePiperDownloadUrl(
        'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/carl/medium/en_US-carl-medium.onnx.json',
      ),
    ).toBe(
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx.json',
    );
  });

  it('rewrites GitHub blob URLs to raw.githubusercontent.com', () => {
    expect(
      normalizePiperDownloadUrl(
        'https://github.com/owner/repo/blob/main/voices/en_US-carl-medium.onnx',
      ),
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/voices/en_US-carl-medium.onnx',
    );
  });

  it('leaves resolve URLs unchanged', () => {
    const url =
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx';
    expect(normalizePiperDownloadUrl(url)).toBe(url);
  });
});

describe('piperDownloadTargets', () => {
  it('maps onnx and onnx.json URLs onto the expected filenames', () => {
    const targets = piperDownloadTargets('en_US-carl-medium', [
      'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx',
      'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/carl/medium/en_US-carl-medium.onnx.json',
    ]);

    expect(targets).toEqual([
      {
        kind: 'onnx',
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx',
        filename: 'en_US-carl-medium.onnx',
      },
      {
        kind: 'onnx.json',
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/carl/medium/en_US-carl-medium.onnx.json',
        filename: 'en_US-carl-medium.onnx.json',
      },
    ]);
  });

  it('classifies a trailing .json sidecar as onnx.json', () => {
    expect(classifyPiperDownloadUrl('https://example.com/voice.json')).toBe(
      'onnx.json',
    );
  });
});

describe('mergePiperCatalog', () => {
  it('keeps local-only voices without a download flag', () => {
    const local = [localVoice('en_US-lessac-medium')];
    const merged = mergePiperCatalog(local, catalog);

    const lessac = merged.find((v) => v.voiceId === 'en_US-lessac-medium');
    expect(lessac?.voiceId).toBe('en_US-lessac-medium');
    expect(lessac?.needsDownload).toBeUndefined();
  });

  it('does not mark catalog voices that are already local as needing download', () => {
    const local = [localVoice('en_US-carl-medium')];
    const merged = mergePiperCatalog(local, catalog);
    const carls = merged.filter((v) => v.voiceId === 'en_US-carl-medium');

    expect(carls).toHaveLength(1);
    expect(carls[0].needsDownload).toBeUndefined();
    expect(carls[0].displayName).toContain('English');
  });

  it('adds catalog-only voices with parsed language/locale and needsDownload', () => {
    const merged = mergePiperCatalog([localVoice('en_US-lessac-medium')], catalog);
    const kareem = merged.find((v) => v.voiceId === 'en_US-kareem-low');

    expect(kareem).toMatchObject({
      providerName: 'piper',
      voiceName: 'en_US-kareem-low',
      language: 'en',
      locale: 'en-US',
      displayName: 'kareem — low',
      needsDownload: true,
      catalogSource: {
        name: 'simoniz0r/piper-voice-models',
        reference:
          'https://github.com/simoniz0r/piper-voice-models/tree/main',
      },
    });
  });

  it('hides the download flag when files are already installed on disk', () => {
    const merged = mergePiperCatalog([], catalog, ['en_US-kareem-low']);
    const kareem = merged.find((v) => v.voiceId === 'en_US-kareem-low');
    expect(kareem?.needsDownload).toBeUndefined();
  });

  it('uses the first catalog source when the same id appears twice', () => {
    const found = findCatalogEntry(catalog, 'en_US-carl-medium');
    expect(found?.source.name).toBe('simoniz0r/piper-voice-models');
  });
});

describe('stripPiperOnnxSuffix', () => {
  it('strips .onnx but not .onnx.json', () => {
    expect(stripPiperOnnxSuffix('en_US-carl-medium.onnx')).toBe(
      'en_US-carl-medium',
    );
    expect(stripPiperOnnxSuffix('en_US-carl-medium')).toBe('en_US-carl-medium');
  });
});
