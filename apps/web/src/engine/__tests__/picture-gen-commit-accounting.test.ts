import { describe, expect, it } from 'vitest';
import {
  backfillPictureCompiledPrompts,
  commitPicturePreviewUrls,
  MAX_PICTURE_PREVIEW_URLS,
  mergePictureCompiledPrompts,
  mergePicturePreviewUrls,
  resolvePictureCompiledPrompt,
} from '../picture-gen-commit';

interface DeskNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

function chainNode(shotIds: string[]): DeskNode {
  return {
    id: 'desk',
    type: 'storyboard-desk',
    data: {
      chainStoryboard: {
        version: 1,
        shots: shotIds.map((id, index) => ({ id, index: index + 1, sceneCode: '1' })),
      },
    },
  };
}

describe('mergePicturePreviewUrls 追加语义', () => {
  it('prepend 把新图置顶且去重', () => {
    expect(
      mergePicturePreviewUrls(['/old.png', '/keep.png'], ['/new.png', '/old.png'], 'prepend'),
    ).toEqual(['/new.png', '/old.png', '/keep.png']);
  });

  it('append 接到末尾', () => {
    expect(mergePicturePreviewUrls(['/a.png'], ['/b.png'], 'append')).toEqual([
      '/a.png',
      '/b.png',
    ]);
  });

  it('replace 整表替换', () => {
    expect(mergePicturePreviewUrls(['/a.png'], ['/b.png'], 'replace')).toEqual(['/b.png']);
  });

  it('超出上限时截断最旧', () => {
    const existing = Array.from({ length: MAX_PICTURE_PREVIEW_URLS }, (_, i) => `/old-${i}.png`);
    const merged = mergePicturePreviewUrls(existing, ['/fresh.png'], 'prepend');
    expect(merged).toHaveLength(MAX_PICTURE_PREVIEW_URLS);
    expect(merged[0]).toBe('/fresh.png');
    expect(merged).not.toContain(`/old-${MAX_PICTURE_PREVIEW_URLS - 1}.png`);
  });
});

describe('选中图发送稿按 url 解析', () => {
  it('优先读 previewCompiledPrompts', () => {
    expect(
      resolvePictureCompiledPrompt(
        {
          lastCompiledPrompt: 'latest',
          previewCompiledPrompts: { '/old.png': 'old-prompt', '/new.png': 'new-prompt' },
        },
        '/old.png',
      ),
    ).toBe('old-prompt');
  });

  it('映射缺失时回退历史轮次', () => {
    expect(
      resolvePictureCompiledPrompt(
        {
          lastCompiledPrompt: 'latest',
          generationHistory: [
            {
              id: 'pgh-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              prompt: 'hist',
              compiledPrompt: 'from-history',
              urls: ['/legacy.png'],
            },
          ],
        },
        '/legacy.png',
      ),
    ).toBe('from-history');
  });

  it('无映射时旧图不误用最新 lastCompiledPrompt', () => {
    expect(
      resolvePictureCompiledPrompt(
        {
          lastCompiledPrompt: 'latest-only',
          previewUrls: ['/new.png', '/old.png'],
        },
        '/old.png',
      ),
    ).toBeUndefined();
    expect(
      resolvePictureCompiledPrompt(
        {
          lastCompiledPrompt: 'latest-only',
          previewUrls: ['/new.png', '/old.png'],
        },
        '/new.png',
      ),
    ).toBe('latest-only');
  });

  it('历史从旧到新回填，不被整表快照覆盖', () => {
    expect(
      resolvePictureCompiledPrompt(
        {
          lastCompiledPrompt: 'latest',
          previewUrls: ['/new.png', '/old.png'],
          generationHistory: [
            {
              id: 'pgh-2',
              createdAt: '2026-01-02T00:00:00.000Z',
              prompt: 'bundle',
              compiledPrompt: 'latest-bundle',
              urls: ['/new.png', '/old.png'],
            },
            {
              id: 'pgh-1',
              createdAt: '2026-01-01T00:00:00.000Z',
              prompt: 'old',
              compiledPrompt: 'old-only',
              urls: ['/old.png'],
            },
          ],
        },
        '/old.png',
      ),
    ).toBe('old-only');
  });

  it('merge 只覆盖本轮新图并裁剪', () => {
    const merged = mergePictureCompiledPrompts(
      { '/keep.png': 'keep', '/drop.png': 'drop' },
      ['/new.png', '/keep.png'],
      ['/new.png'],
      'fresh',
    );
    expect(merged).toEqual({ '/new.png': 'fresh', '/keep.png': 'keep' });
  });

  it('追加前用上一轮 lastCompiledPrompt 回填旧图', () => {
    const backfilled = backfillPictureCompiledPrompts({}, ['/old.png'], 'prev-prompt');
    const merged = mergePictureCompiledPrompts(
      backfilled,
      ['/new.png', '/old.png'],
      ['/new.png'],
      'new-prompt',
    );
    expect(merged).toEqual({ '/new.png': 'new-prompt', '/old.png': 'prev-prompt' });
  });
});

describe('PG-42 继续查询账本回流', () => {
  it('commitPicturePreviewUrls 把 usedAssetIds / characterRevisionPins 写回镜表', () => {
    const nodes = [chainNode(['shot-1']), { id: 'pic', type: 'picture-gen', data: {} }];
    const edges = [{ source: 'desk', target: 'pic' }];
    const calls: Array<[string, Record<string, unknown>]> = [];
    const updateNodeData = (id: string, data: Record<string, unknown>) => {
      calls.push([id, data]);
    };

    commitPicturePreviewUrls({
      blockId: 'pic',
      data: {
        linkedShotId: 'shot-1',
        usedAssetIds: ['asset-1', 'asset-2'],
        characterRevisionPins: { c1: 3 },
      },
      urls: ['/media/new.png'],
      updateNodeData,
      nodes: nodes as never,
      edges: edges as never,
    });

    const deskCall = calls.find(([id]) => id === 'desk');
    expect(deskCall).toBeDefined();
    const written = (
      deskCall![1].chainStoryboard as { shots: Array<Record<string, unknown>> }
    ).shots.find((s) => s.id === 'shot-1');
    expect(written?.firstFrameAssetId).toBe('/media/new.png');
    expect(written?.usedAssetIds).toEqual(['asset-1', 'asset-2']);
    expect(written?.characterRevisionPins).toEqual({ c1: 3 });
  });

  it('无账本字段时不写空数组/空对象', () => {
    const nodes = [chainNode(['shot-1']), { id: 'pic', type: 'picture-gen', data: {} }];
    const edges = [{ source: 'desk', target: 'pic' }];
    const calls: Array<[string, Record<string, unknown>]> = [];
    const updateNodeData = (id: string, data: Record<string, unknown>) => {
      calls.push([id, data]);
    };

    commitPicturePreviewUrls({
      blockId: 'pic',
      data: { linkedShotId: 'shot-1' },
      urls: ['/media/new.png'],
      updateNodeData,
      nodes: nodes as never,
      edges: edges as never,
    });

    const deskCall = calls.find(([id]) => id === 'desk');
    const written = (
      deskCall![1].chainStoryboard as { shots: Array<Record<string, unknown>> }
    ).shots.find((s) => s.id === 'shot-1');
    expect(written?.firstFrameAssetId).toBe('/media/new.png');
    expect(written?.usedAssetIds).toBeUndefined();
    expect(written?.characterRevisionPins).toBeUndefined();
  });
});
