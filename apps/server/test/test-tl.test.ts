import { describe, it, expect } from 'vitest';

describe('TEST-TL — Tool Service (pure function tests)', () => {

  it('TEST-TL-002: proxy-download - URL validation for download proxy', () => {
    const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

    const extractUrlFromText = (input: string): string => {
      const trimmed = input.trim();
      if (!trimmed) throw new Error('URL 为空');
      try {
        return new URL(trimmed).href;
      } catch {
        // fall through
      }
      const match = trimmed.match(URL_IN_TEXT_RE);
      if (!match?.[0]) throw new Error('未在文本中找到有效链接');
      return match[0].replace(/[.,;:!?)]+$/g, '');
    };

    expect(extractUrlFromText('https://cdn.example.com/video.mp4')).toBe('https://cdn.example.com/video.mp4');
    expect(extractUrlFromText('  https://cdn.example.com/image.png  ')).toBe('https://cdn.example.com/image.png');
    expect(extractUrlFromText('download from https://cdn.example.com/file.mp4 please')).toBe('https://cdn.example.com/file.mp4');

    expect(() => extractUrlFromText('')).toThrow('URL 为空');
    expect(() => extractUrlFromText('not-a-url')).toThrow('未在文本中找到有效链接');
    expect(() => extractUrlFromText('not-a-url-without-protocol')).toThrow('未在文本中找到有效链接');
  });
});
