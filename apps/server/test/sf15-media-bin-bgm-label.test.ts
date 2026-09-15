import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../../web/src');

describe('SF-15 素材箱 BGM 标签诚实', () => {
  it('MediaBinPanel 用 bgmUrls 区分 BGM 标签；EditDesk 传入 upstreamBgmUrls', () => {
    const bin = readFileSync(resolve(webSrc, 'blocks/core/clip-editor/MediaBinPanel.tsx'), 'utf8');
    expect(bin).toContain('bgmUrls?: string[]');
    expect(bin).toContain('bgmSet.has(url)');
    expect(bin).toContain("isBgm ? 'BGM' : '音频'");

    const desk = readFileSync(resolve(webSrc, 'blocks/core/clip-editor/EditDesk.tsx'), 'utf8');
    expect(desk).toContain('bgmUrls={upstreamBgmUrls}');
  });
});
