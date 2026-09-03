import { normalizePiperThreadCap } from './piper-http-server.service';

jest.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
  },
}));

describe('normalizePiperThreadCap', () => {
  it('keeps 1, 2, and 4', () => {
    expect(normalizePiperThreadCap('1')).toBe('1');
    expect(normalizePiperThreadCap('2')).toBe('2');
    expect(normalizePiperThreadCap('4')).toBe('4');
  });

  it('falls back to auto for missing or unknown values', () => {
    expect(normalizePiperThreadCap('auto')).toBe('auto');
    expect(normalizePiperThreadCap(undefined)).toBe('auto');
    expect(normalizePiperThreadCap(null)).toBe('auto');
    expect(normalizePiperThreadCap('8')).toBe('auto');
    expect(normalizePiperThreadCap('')).toBe('auto');
  });
});
