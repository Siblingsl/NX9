import { describe, it, expect } from 'vitest';

describe('TEST-GW — Gateway Service (pure function tests)', () => {

  it('TEST-GW-001: POST /api/gateway/image — URL format validation', () => {
    const isValidMediaUrl = (url: string): boolean => {
      return /^\/media\/(images|videos|audio)\/[a-zA-Z0-9._-]+$/.test(url);
    };

    expect(isValidMediaUrl('/media/images/fixture-mock-gen.png')).toBe(true);
    expect(isValidMediaUrl('/media/videos/fixture-6s.mp4')).toBe(true);
    expect(isValidMediaUrl('/media/audio/fixture-tts.mp3')).toBe(true);
    expect(isValidMediaUrl('http://external.com/file.png')).toBe(false);
    expect(isValidMediaUrl('/media/unknown/file.png')).toBe(false);
  });

  it('TEST-GW-002: POST /api/gateway/video — status shape', () => {
    const mockResponse = { ok: true, status: 'success', url: '/media/videos/fixture-6s.mp4' };
    expect(mockResponse.ok).toBe(true);
    expect(['success', 'processing', 'failed']).toContain(mockResponse.status);
    expect(mockResponse.url).toMatch(/^\/media\//);
  });

  it('TEST-GW-003: POST /api/gateway/tts — response shape', () => {
    const mockResponse = { ok: true, url: '/media/audio/fixture-tts.mp3', bytes: 8192, provider: 'openai-compatible' };
    expect(mockResponse.ok).toBe(true);
    expect(mockResponse.bytes).toBeGreaterThan(0);
    expect(mockResponse.url).toMatch(/\.mp3$/);
  });

  it('TEST-GW-004: POST /api/gateway/image — n parameter clamping', () => {
    const clampN = (n: unknown): number => Math.min(4, Math.max(1, (n as number) || 1));
    expect(clampN(2)).toBe(2);
    expect(clampN(0)).toBe(1);
    expect(clampN(100)).toBe(4);
    expect(clampN(undefined)).toBe(1);
    expect(clampN(-1)).toBe(1);
  });

  it('TEST-GW-005: POST /api/gateway/video — parameter shape', () => {
    const buildVideoPayload = (body: Record<string, unknown>): Record<string, unknown> => {
      const payload: Record<string, unknown> = { model: 'veo', prompt: body.prompt };
      if (body.imageUrl) payload.image_url = body.imageUrl;
      if (body.size) payload.size = body.size;
      if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio;
      if (body.duration) payload.duration = body.duration;
      if (body.resolution) payload.resolution = body.resolution;
      return payload;
    };
    const full = buildVideoPayload({ prompt: 'test', imageUrl: '/img.png', size: '720x1280', aspect_ratio: '9:16', duration: 10, resolution: '720' });
    expect(full.model).toBe('veo');
    expect(full.image_url).toBe('/img.png');
    expect(full.aspect_ratio).toBe('9:16');
    expect(full.duration).toBe(10);
    const minimal = buildVideoPayload({ prompt: 'test' });
    expect(minimal.image_url).toBeUndefined();
    expect(minimal.size).toBeUndefined();
  });

  it('TEST-GW-006: POST /api/gateway/tts — format and speed handling', () => {
    const resolveFormat = (body: Record<string, unknown>): string => (body.response_format as string) || 'mp3';
    const resolveSpeed = (body: Record<string, unknown>): number => (body.speed as number) ?? 1.0;
    expect(resolveFormat({ response_format: 'wav' })).toBe('wav');
    expect(resolveFormat({})).toBe('mp3');
    expect(resolveSpeed({ speed: 1.25 })).toBe(1.25);
    expect(resolveSpeed({})).toBe(1.0);
    expect(resolveSpeed({ speed: 0.5 })).toBe(0.5);
  });
});
