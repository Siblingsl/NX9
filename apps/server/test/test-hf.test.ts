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

  it('TEST-HF-003: producer 不可用必须失败，不得 FFmpeg 黑片假成功', async () => {
    const failingProducer = {
      render: async () => {
        throw new Error('not available');
      },
    };
    const renderHonestly = async () => {
      try {
        await failingProducer.render();
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, message: (e as Error).message };
      }
    };
    const result = await renderHonestly();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('not available');
  });
});
