import { describe, expect, it } from 'vitest';
import { buildSubtitleClipsFromCues, type TimelineOp } from '@nx9/shared';
import { detectSuggestionConflicts } from '../suggestion-conflict';

describe('SE-EDIT-03: AI 字幕 cues → 时间线字幕片段', () => {
  const clip = { startSec: 10, trimInSec: 2, speed: 1 };

  it('素材相对时间换算为时间线绝对时间，入点前丢弃', () => {
    const res = buildSubtitleClipsFromCues(clip, [
      { startSec: 0, endSec: 1, text: '入点前' },
      { startSec: 2, endSec: 4, text: '开场白' },
      { startSec: 5, endSec: 8, text: '第二句' },
    ]);
    expect(res.dropped).toBe(1);
    expect(res.clips).toHaveLength(2);
    expect(res.clips[0].startSec).toBe(10); // (2-2)/1 + 10
    expect(res.clips[0].durationSec).toBe(2);
    expect(res.clips[0].text).toBe('开场白');
    expect(res.clips[0].type).toBe('subtitle');
    expect(res.clips[1].startSec).toBe(13);
    expect(res.clips[1].durationSec).toBe(3);
  });

  it('变速 2× 时时间轴时长折半', () => {
    const res = buildSubtitleClipsFromCues({ startSec: 0, trimInSec: 0, speed: 2 }, [
      { startSec: 2, endSec: 6, text: '加速' },
    ]);
    expect(res.clips[0].startSec).toBe(1);
    expect(res.clips[0].durationSec).toBe(2);
  });

  it('空文本与非正时长丢弃', () => {
    const res = buildSubtitleClipsFromCues(clip, [
      { startSec: 2, endSec: 4, text: '   ' },
      { startSec: 3, endSec: 3, text: '零时长' },
    ]);
    expect(res.clips).toHaveLength(0);
    expect(res.dropped).toBe(2);
  });
});

describe('SE-EDIT: set-timeline-meta 建议冲突目标', () => {
  it('画布元数据建议之间互相冲突，与片段建议不冲突', () => {
    const sg = (id: string, ops: TimelineOp[]) => ({ id, ops, targetClipIds: [] as string[] });
    const report = detectSuggestionConflicts([
      sg('a', [{ op: 'set-timeline-meta', patch: { aspect: '16:9' } }]),
      sg('b', [{ op: 'set-timeline-meta', patch: { background: { kind: 'color', color: '#000' } } }]),
      sg('c', [{ op: 'set-clip', clipId: 'x1', patch: { volume: 0.5 } }]),
    ]);
    expect(report.contestedTargets).toEqual(['timeline']);
    expect(report.conflictingSuggestionIds.sort()).toEqual(['a', 'b']);
  });
});
