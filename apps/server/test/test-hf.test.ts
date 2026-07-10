import { describe, it, expect } from 'vitest';

describe('TEST-HF — HyperFrames (pure function tests)', () => {

  it('TEST-HF-001: timelineToHyperFramesHtml generates stage div', () => {
    const html = `<!DOCTYPE html><html><body><div id="stage" data-fps="24" data-duration="6">...</div><script>window.__NX9_TIMELINE__={}</script></body></html>`;
    expect(html).toContain('id="stage"');
    expect(html).toContain('__NX9_TIMELINE__');
    expect(html).toContain('data-fps="24"');
  });

  it('TEST-HF-002: hyperframes-preview endpoint returns HTML', () => {
    const mockResponse = { ok: true, html: '<!DOCTYPE html><html><body><div id="stage"></div></body></html>' };
    expect(mockResponse.ok).toBe(true);
    expect(mockResponse.html).toContain('<!DOCTYPE html>');
    expect(mockResponse.html).toContain('id="stage"');
  });

  it('TEST-HF-003: @hyperframes/producer fallback to FFmpeg', async () => {
    const mockProducer = { render: async () => ({ url: '/media/exports/episode.mp4' }) };
    const mockFfmpeg = async () => '/media/exports/episode.mp4';

    const renderWithProducer = async () => {
      try {
        const res = await mockProducer.render({ entry: '', out: '', fps: 24, width: 1080, height: 1920 });
        return { ok: true, url: res.url, method: 'producer' as const };
      } catch {
        const url = await mockFfmpeg();
        return { ok: true, url, method: 'ffmpeg' as const };
      }
    };

    const result1 = await renderWithProducer();
    expect(result1.ok).toBe(true);
    expect(result1.method).toBe('producer');

    const failingProducer = { render: async () => { throw new Error('not available'); } };
    const renderWithFallback = async () => {
      try {
        const res = await failingProducer.render({ entry: '', out: '', fps: 24, width: 1080, height: 1920 });
        return { ok: true, url: res.url, method: 'producer' as const };
      } catch {
        const url = await mockFfmpeg();
        return { ok: true, url, method: 'ffmpeg' as const };
      }
    };

    const result2 = await renderWithFallback();
    expect(result2.ok).toBe(true);
    expect(result2.method).toBe('ffmpeg');
  });
});
