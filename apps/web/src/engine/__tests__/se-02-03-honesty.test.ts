import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  detectSuggestionConflicts,
  planAcceptAllSuggestions,
  timelineOpTargets,
} from '../suggestion-conflict';

const webSrc = resolve(__dirname, '..');

describe('SE-03 suggestion conflict', () => {
  it('timelineOpTargets 覆盖 clip / track', () => {
    expect(timelineOpTargets({ op: 'trim-clip', clipId: 'c1', edge: 'end', deltaSec: 1 })).toEqual([
      'clip:c1',
    ]);
    expect(timelineOpTargets({ op: 'duck-audio', trackId: 'A1', volume: 0.5 })).toEqual([
      'track:A1',
    ]);
  });

  it('无重叠时 conflictFree', () => {
    const report = detectSuggestionConflicts([
      {
        id: 's1',
        targetClipIds: ['c1'],
        ops: [{ op: 'trim-clip', clipId: 'c1', edge: 'end', deltaSec: -0.5 }],
      },
      {
        id: 's2',
        targetClipIds: ['c2'],
        ops: [{ op: 'set-transition', clipId: 'c2', transition: { kind: 'fade', durationSec: 0.3 } }],
      },
    ]);
    expect(report.conflictFree).toBe(true);
    expect(report.conflictingSuggestionIds).toEqual([]);
  });

  it('同 clip 两条建议判定冲突', () => {
    const report = detectSuggestionConflicts([
      {
        id: 's1',
        targetClipIds: ['c1'],
        ops: [{ op: 'trim-clip', clipId: 'c1', edge: 'end', deltaSec: -0.5 }],
      },
      {
        id: 's2',
        targetClipIds: ['c1'],
        ops: [{ op: 'set-clip', clipId: 'c1', patch: { volume: 0.8 } }],
      },
    ]);
    expect(report.conflictFree).toBe(false);
    expect(report.conflictingSuggestionIds.sort()).toEqual(['s1', 's2']);
    expect(report.contestedTargets).toContain('clip:c1');
  });

  it('planAcceptAll 冲突时给出提示且仍逐条 apply', () => {
    const plan = planAcceptAllSuggestions([
      {
        id: 's1',
        targetClipIds: ['c1'],
        ops: [{ op: 'remove-clip', clipId: 'c1' }],
      },
      {
        id: 's2',
        targetClipIds: ['c1'],
        ops: [{ op: 'trim-clip', clipId: 'c1', edge: 'start', deltaSec: 0.2 }],
      },
    ]);
    expect(plan.applyPerSuggestion).toBe(true);
    expect(plan.conflictNote).toMatch(/目标重叠/);
  });

  it('EditDesk 使用 planAcceptAllSuggestions，不再一次性合并 ops', () => {
    const src = readFileSync(
      resolve(webSrc, '../blocks/core/clip-editor/EditDesk.tsx'),
      'utf8',
    );
    expect(src).toContain('planAcceptAllSuggestions');
    expect(src).toContain('conflictNote');
    expect(src).not.toMatch(/for \(const sg of pendingItems\) \{\s*if \(sg\.ops\) ops\.push/);
  });
});

describe('SE-02 FFmpeg 预览诚实', () => {
  it('渲染层与导出面板明示不含裁剪转场', () => {
    const render = readFileSync(resolve(webSrc, 'clip-editor-render.ts'), 'utf8');
    expect(render).toMatch(/不含裁剪/);

    const desk = readFileSync(
      resolve(webSrc, '../blocks/core/clip-editor/EditDesk.tsx'),
      'utf8',
    );
    expect(desk).toMatch(/不含裁剪/);
    expect(desk).toContain('FFmpeg 粗预览');
  });
});
