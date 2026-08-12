import { describe, expect, it } from 'vitest';
import {
  emptyScreenplayPackage,
  extractDialogueLinesFromPackage,
  extractDialogueLinesFromText,
  gatherUpstream,
  resolveVoiceCastLines,
  type FlowBlock,
  type FlowLink,
} from '@nx9/shared';

function makeBlock(id: string, type: string, data: Record<string, unknown> = {}): FlowBlock {
  return { id, type, position: { x: 0, y: 0 }, data };
}
function makeLink(source: string, target: string): FlowLink {
  return { id: `${source}->${target}`, source, target };
}

describe('extractDialogueLinesFromText', () => {
  it('抽取「角色：对白」且不截断条数', () => {
    const text = ['林夏：这是谁？', '旁白：夜色渐浓。', '苏晚：跟我走。', '不是对白', '甲：第一句', '乙：第二句', '丙：第三句'].join('\n');
    const lines = extractDialogueLinesFromText(text);
    expect(lines.map((l) => l.speaker)).toEqual(['林夏', '旁白', '苏晚', '甲', '乙', '丙']);
  });
});

describe('gatherUpstream 对白', () => {
  it('从编剧台成稿抽取 lines', () => {
    const pkg = emptyScreenplayPackage();
    pkg.screenplay.episodes = [
      { id: 'ep-1', index: 1, title: '第1集', bodyMd: '林夏：这是谁？\n苏晚：跟我走。', updatedAt: new Date().toISOString() },
    ];
    const blocks = [
      makeBlock('script', 'script-desk', { package: pkg }),
      makeBlock('voice', 'voice-cast', {}),
    ];
    const result = gatherUpstream('voice', blocks, [makeLink('script', 'voice')]);
    expect(result.lines).toEqual([
      { speaker: '林夏', text: '这是谁？' },
      { speaker: '苏晚', text: '跟我走。' },
    ]);
  });

  it('从分镜台 data.lines 收集，优先于成稿抽取', () => {
    const pkg = emptyScreenplayPackage();
    pkg.screenplay.episodes = [
      { id: 'ep-1', index: 1, title: '第1集', bodyMd: '林夏：成稿对白', updatedAt: new Date().toISOString() },
    ];
    const blocks = [
      makeBlock('board', 'storyboard-desk', {
        package: pkg,
        lines: [{ speaker: '林夏', text: '拆镜对白', emotion: '怒' }],
      }),
      makeBlock('voice', 'voice-cast', {}),
    ];
    const result = gatherUpstream('voice', blocks, [makeLink('board', 'voice')]);
    expect(result.lines).toEqual([{ speaker: '林夏', text: '拆镜对白', emotion: '怒' }]);
  });
});

describe('resolveVoiceCastLines', () => {
  it('本节点非空优先，否则用上游', () => {
    expect(resolveVoiceCastLines([{ speaker: 'A', text: '本节点' }], [{ speaker: 'B', text: '上游' }])).toEqual({
      lines: [{ speaker: 'A', text: '本节点' }],
      source: 'local',
    });
    expect(resolveVoiceCastLines([], [{ speaker: 'B', text: '上游' }])).toEqual({
      lines: [{ speaker: 'B', text: '上游' }],
      source: 'upstream',
    });
    expect(resolveVoiceCastLines([], [])).toEqual({ lines: [], source: 'none' });
  });
});

describe('extractDialogueLinesFromPackage', () => {
  it('跨集合并', () => {
    const pkg = emptyScreenplayPackage();
    pkg.screenplay.episodes = [
      { id: 'ep-1', index: 1, title: '1', bodyMd: '甲：第一句', updatedAt: new Date().toISOString() },
      { id: 'ep-2', index: 2, title: '2', bodyMd: '乙：第二句', updatedAt: new Date().toISOString() },
    ];
    expect(extractDialogueLinesFromPackage(pkg)).toEqual([
      { speaker: '甲', text: '第一句' },
      { speaker: '乙', text: '第二句' },
    ]);
  });
});
