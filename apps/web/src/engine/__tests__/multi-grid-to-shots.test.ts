/**
 * 「多格推演 → 分镜镜头」映射回归（增量新增能力）。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：packages/shared/src/index.ts 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖被测模块本身，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  MULTI_GRID_SHOT_DEFAULT_DURATION_SEC,
  MULTI_GRID_SHOT_ID_PREFIX,
  MULTI_GRID_SHOT_MAX_DURATION_SEC,
  MULTI_GRID_STORY_BEAT_DURATIONS_SEC,
  buildMultiGridShotId,
  buildMultiGridShotPreviewRows,
  buildMultiGridShotWritebackKey,
  describeMultiGridShotPlan,
  insertMultiGridShotsIntoBreakdown,
  multiGridCellsToShots,
  multiGridShotsToBreakdownShots,
  planMultiGridShots,
  resolveMultiGridBreakdownAnchor,
  resolveMultiGridTargetEpisode,
  shotTypeFromShotSizeLabel,
} from '../../../../../packages/shared/src/utils/multi-grid-to-shots';
import { buildMultiGridPlanForMode } from '../../../../../packages/shared/src/utils/multi-grid-plan';
import type { MultiGridPlan } from '../../../../../packages/shared/src/types/multi-grid';
import type { ScriptBreakdownPayload } from '../../../../../packages/shared/src/types/script-breakdown';
import type { StoryboardShot } from '../../../../../packages/shared/src/types/storyboard';

const SOURCE = '/media/uploads/keyframe-01.png';

function upstreamShot(over: Partial<StoryboardShot> & { id: string; index: number }): StoryboardShot {
  return {
    durationSec: 3,
    shotType: 'medium',
    descriptionZh: '上游镜头',
    promptEn: 'upstream shot',
    status: 'draft',
    episodeId: 'ep-1',
    episodeIndex: 1,
    episodeTitle: '第 1 集',
    ...over,
  };
}

const UPSTREAM: StoryboardShot[] = [
  upstreamShot({ id: 'shot-1', index: 1 }),
  upstreamShot({ id: 'shot-2', index: 2 }),
  upstreamShot({ id: 'shot-3', index: 3 }),
  upstreamShot({ id: 'shot-ep2-1', index: 4, episodeId: 'ep-2', episodeIndex: 2, episodeTitle: '第 2 集' }),
];

function breakdownPayload(): ScriptBreakdownPayload {
  return {
    version: 1,
    title: '测试剧本',
    sourceText: '1-1 日 内 咖啡店',
    generatedAt: '2026-01-01T00:00:00.000Z',
    episodes: [
      {
        id: 'ep-1',
        index: 1,
        title: '第 1 集',
        scenes: [],
        shots: [
          {
            id: 'shot-1',
            episodeId: 'ep-1',
            episodeIndex: 1,
            index: 1,
            sceneId: 'ep-1-scene-1',
            sceneCode: '1-1',
            title: '开场',
            durationSec: 4,
            characters: ['阿澈'],
            scene: '咖啡店',
            scriptText: '阿澈推门进店',
            dialogue: [],
            imagePrompt: 'interior cafe, day, a-che enters',
            videoPrompt: 'slow push in',
            status: 'draft',
          },
        ],
      },
      { id: 'ep-2', index: 2, title: '第 2 集', scenes: [], shots: [] },
    ],
  };
}

describe('① 多机位 / 剧情 / 画面推演 → 镜头数', () => {
  it('多机位 9 / 25 宫格：每格一镜', () => {
    const plan9 = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const plan25 = buildMultiGridPlanForMode('multi-cam-25', SOURCE);
    expect(multiGridCellsToShots(plan9)).toHaveLength(9);
    expect(multiGridCellsToShots(plan25)).toHaveLength(25);
  });

  it('剧情推演四宫格：4 镜；画面推演：3 镜', () => {
    expect(multiGridCellsToShots(buildMultiGridPlanForMode('story-predict-4', SOURCE))).toHaveLength(4);
    expect(multiGridCellsToShots(buildMultiGridPlanForMode('frame-predict', SOURCE))).toHaveLength(3);
  });
});

describe('② 序号续接与分集继承', () => {
  it('序号接着上游该集末镜续号（按分集作用域）', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan, { upstreamShots: UPSTREAM });
    expect(res.startIndex).toBe(5);
    expect(res.nextIndex).toBe(9);
    expect(res.shots.map((s) => s.index)).toEqual([5, 6, 7, 8]);
    // 上游末镜属于 ep-2 → 继承该分集
    expect(res.shots.every((s) => s.episodeId === 'ep-2')).toBe(true);
    expect(res.shots[0]?.episodeTitle).toBe('第 2 集');
  });

  it('显式 episodeId 时按该集续号', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan, { upstreamShots: UPSTREAM, episodeId: 'ep-1' });
    expect(res.targetEpisode.episodeId).toBe('ep-1');
    expect(res.startIndex).toBe(4); // ep-1 末镜 index=3
    expect(res.shots.every((s) => s.episodeId === 'ep-1')).toBe(true);
  });

  it('startIndex 可显式覆盖', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan, { startIndex: 100 });
    expect(res.shots.map((s) => s.index)).toEqual([100, 101, 102, 103]);
  });

  it('targetEpisode 可整体覆盖（分集 id / 集号 / 集名）', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan, {
      upstreamShots: UPSTREAM,
      episodeId: 'ep-9',
      episodeIndex: 9,
      episodeTitle: '第 9 集',
    });
    expect(res.targetEpisode).toMatchObject({
      episodeId: 'ep-9',
      episodeIndex: 9,
      episodeTitle: '第 9 集',
      startIndex: 1,
    });
    expect(res.shots.every((s) => s.episodeId === 'ep-9' && s.episodeTitle === '第 9 集')).toBe(true);
  });

  it('无上游镜表：序号从 1 起并给出告警（不假装续号成功）', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan);
    expect(res.startIndex).toBe(1);
    expect(res.warnings.some((w) => w.code === 'no-upstream')).toBe(true);
    expect(res.targetEpisode.episodeId).toBeNull();
  });

  it('resolveMultiGridTargetEpisode：空上游不抛异常', () => {
    const target = resolveMultiGridTargetEpisode(undefined);
    expect(target).toEqual({
      episodeId: null,
      episodeIndex: null,
      episodeTitle: null,
      scopedShots: [],
      startIndex: 1,
    });
  });
});

describe('③ 景别标签 → shotType 映射', () => {
  it('中文景别逐项命中', () => {
    expect(shotTypeFromShotSizeLabel('特写')).toEqual({ shotType: 'close', matched: true });
    expect(shotTypeFromShotSizeLabel('近景')).toEqual({ shotType: 'close', matched: true });
    expect(shotTypeFromShotSizeLabel('中景')).toEqual({ shotType: 'medium', matched: true });
    expect(shotTypeFromShotSizeLabel('全景')).toEqual({ shotType: 'wide', matched: true });
    expect(shotTypeFromShotSizeLabel('大远景')).toEqual({ shotType: 'extreme-wide', matched: true });
  });

  it('「大远景」不被「远景」截胡；英文标签同样可映射', () => {
    expect(shotTypeFromShotSizeLabel('大远景').shotType).toBe('extreme-wide');
    expect(shotTypeFromShotSizeLabel('extreme wide shot').shotType).toBe('extreme-wide');
    expect(shotTypeFromShotSizeLabel('close-up').shotType).toBe('close');
    expect(shotTypeFromShotSizeLabel('Medium Shot').shotType).toBe('medium');
  });

  it('未命中 / 空标签 → custom 且 matched=false', () => {
    expect(shotTypeFromShotSizeLabel('邪视角')).toEqual({ shotType: 'custom', matched: false });
    expect(shotTypeFromShotSizeLabel('')).toEqual({ shotType: 'custom', matched: false });
    expect(shotTypeFromShotSizeLabel(undefined)).toEqual({ shotType: 'custom', matched: false });
  });

  it('多机位 9 宫格：3 景别（近景/中景/全景）逐行映射到 close/medium/wide', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const shots = multiGridCellsToShots(plan);
    // 行为景别：row0 近景、row1 中景、row2 全景；列为方位
    expect(shots.slice(0, 3).every((s) => s.shotType === 'close')).toBe(true);
    expect(shots.slice(3, 6).every((s) => s.shotType === 'medium')).toBe(true);
    expect(shots.slice(6, 9).every((s) => s.shotType === 'wide')).toBe(true);
  });

  it('多机位 25 宫格：含大远景 → extreme-wide', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-25', SOURCE);
    const shots = multiGridCellsToShots(plan);
    expect(shots.some((s) => s.shotType === 'extreme-wide')).toBe(true);
    expect(shots.filter((s) => s.shotType === 'custom')).toHaveLength(0);
  });

  it('剧情 / 画面推演没有景别语义 → custom 并给出模式级告警', () => {
    const story = planMultiGridShots(buildMultiGridPlanForMode('story-predict-4', SOURCE));
    expect(story.shots.every((s) => s.shotType === 'custom')).toBe(true);
    expect(story.warnings.some((w) => w.code === 'no-shot-size-mode')).toBe(true);
  });
});

describe('④ 时长', () => {
  it('多机位：默认 3s，可被 opts.defaultDurationSec 覆盖', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    expect(multiGridCellsToShots(plan).every((s) => s.durationSec === MULTI_GRID_SHOT_DEFAULT_DURATION_SEC)).toBe(true);
    expect(multiGridCellsToShots(plan, { defaultDurationSec: 5 }).every((s) => s.durationSec === 5)).toBe(true);
  });

  it('剧情推演：时长递增（起因 → 收束）', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const durations = multiGridCellsToShots(plan).map((s) => s.durationSec);
    expect(durations).toEqual([...MULTI_GRID_STORY_BEAT_DURATIONS_SEC]);
    for (let i = 1; i < durations.length; i += 1) {
      expect(durations[i]!).toBeGreaterThan(durations[i - 1]!);
    }
  });

  it('画面推演：按时间偏移取时长，当前帧用默认单镜时长', () => {
    const plan = buildMultiGridPlanForMode('frame-predict', SOURCE, { beforeSec: 5, afterSec: 3 });
    const shots = multiGridCellsToShots(plan);
    expect(shots.map((s) => s.durationSec)).toEqual([5, MULTI_GRID_SHOT_DEFAULT_DURATION_SEC, 3]);
  });

  it('逐格时长优先于全局默认，超上限收敛并告警', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const perCell = multiGridCellsToShots(plan, {
      cellDurationsSec: [1, 2, 999],
      defaultDurationSec: 8,
    });
    expect(perCell[0]?.durationSec).toBe(1);
    expect(perCell[1]?.durationSec).toBe(2);
    expect(perCell[2]?.durationSec).toBe(MULTI_GRID_SHOT_MAX_DURATION_SEC);
    const res = planMultiGridShots(plan, { cellDurationsSec: [0, 2, 999] });
    expect(res.warnings.some((w) => w.code === 'clamped-duration')).toBe(true);
  });
});

describe('⑤ 中英字段与机位语义', () => {
  it('三种模式都给出中英成对字段（descriptionZh / promptEn / videoPromptEn）', () => {
    for (const mode of ['multi-cam-9', 'multi-cam-25', 'story-predict-4', 'frame-predict'] as const) {
      const shots = multiGridCellsToShots(buildMultiGridPlanForMode(mode, SOURCE));
      expect(shots.length).toBeGreaterThan(0);
      for (const shot of shots) {
        expect(shot.descriptionZh.trim().length).toBeGreaterThan(0);
        expect(shot.promptEn.trim().length).toBeGreaterThan(0);
        expect(shot.videoPromptEn?.trim().length ?? 0).toBeGreaterThan(0);
        expect(shot.notes?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('多机位：描述含机位 / 景别，提示词复用该格 imagePrompt，运镜写入 cameraMove', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE, { focalRange: [24, 70] });
    const shots = multiGridCellsToShots(plan);
    const first = shots[0]!;
    expect(first.descriptionZh).toContain('左前 45°');
    expect(first.descriptionZh).toContain('近景');
    expect(first.promptEn).toBe(plan.cells[0]!.imagePrompt);
    expect(first.cameraMove).toBe('固定');
    expect(first.videoPromptEn).toContain('locked-off');
    // 机位建议值（焦距 / 高度 / 坐标）落进既有 notes 字段，不新增字段
    expect(first.notes).toContain('等效焦距');
    expect(first.notes).toContain('建议机位');
    expect(first.notes).toContain('非对源图的实测');
  });

  it('剧情推演：描述用 role + 剧情节拍，不写没有依据的运镜', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const shots = multiGridCellsToShots(plan);
    expect(shots[0]?.descriptionZh).toContain('起因确立');
    expect(shots[2]?.descriptionZh).toContain('转折');
    expect(shots.every((s) => s.cameraMove === undefined)).toBe(true);
  });

  it('画面推演：描述写明时间方向；当前帧说明直接复用源图', () => {
    const plan = buildMultiGridPlanForMode('frame-predict', SOURCE, { beforeSec: 5, afterSec: 3 });
    const shots = multiGridCellsToShots(plan);
    expect(shots[0]?.descriptionZh).toContain('时间回溯 5 秒');
    expect(shots[1]?.descriptionZh).toContain('当前帧');
    expect(shots[2]?.descriptionZh).toContain('时间推进 3 秒');
    expect(shots[1]?.notes).toContain('本格直接复用源图');
  });
});

describe('⑥ id 稳定、唯一、不与既有前缀冲突', () => {
  it('同一计划两次映射得到同一批 id（稳定）', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    expect(multiGridCellsToShots(plan).map((s) => s.id)).toEqual(multiGridCellsToShots(plan).map((s) => s.id));
  });

  it('批内唯一，且带独立前缀（不撞 shot-* / shot-manual-* / shot-grid-*）', () => {
    const shots = multiGridCellsToShots(buildMultiGridPlanForMode('multi-cam-25', SOURCE));
    const ids = shots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith(`${MULTI_GRID_SHOT_ID_PREFIX}-`))).toBe(true);
    expect(ids.every((id) => !id.startsWith('shot-manual-') && !id.startsWith('shot-grid-'))).toBe(true);
  });

  it('提示词或源图变化 → id 变化（改写稿作为新镜写回）', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const edited: MultiGridPlan = {
      ...plan,
      cells: plan.cells.map((cell, i) => (i === 0 ? { ...cell, imagePrompt: 'rewritten prompt' } : cell)),
    };
    expect(multiGridCellsToShots(plan)[0]!.id).not.toBe(multiGridCellsToShots(edited)[0]!.id);
    const otherSource = buildMultiGridPlanForMode('multi-cam-9', '/media/uploads/keyframe-02.png');
    expect(multiGridCellsToShots(plan)[0]!.id).not.toBe(multiGridCellsToShots(otherSource)[0]!.id);
  });

  it('idFactory 可注入（调用方接管 id 生成）', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const shots = multiGridCellsToShots(plan, {
      idFactory: ({ cellIndex }) => `custom-${cellIndex}`,
    });
    expect(shots[0]?.id).toBe('custom-0');
    expect(shots[8]?.id).toBe('custom-8');
    // 默认生成器是纯函数：同一入参必得同一 id
    const input = { mode: 'multi-cam-9' as const, plan, cell: plan.cells[0]!, cellIndex: 0, order: 0 };
    expect(buildMultiGridShotId(input)).toBe(buildMultiGridShotId(input));
    expect(multiGridCellsToShots(plan)[0]?.id).toBe(buildMultiGridShotId(input));
  });
});

describe('⑦ 时间偏移排序（画面推演）', () => {
  it('乱序 cells 仍按 过去 → 当前 → 未来 排列，且序号连续', () => {
    const plan = buildMultiGridPlanForMode('frame-predict', SOURCE, { beforeSec: 5, afterSec: 3 });
    const shuffled: MultiGridPlan = { ...plan, cells: [plan.cells[2]!, plan.cells[0]!, plan.cells[1]!] };
    const shots = multiGridCellsToShots(shuffled, { upstreamShots: [], startIndex: 1 });
    expect(shots.map((s) => s.durationSec)).toEqual([5, MULTI_GRID_SHOT_DEFAULT_DURATION_SEC, 3]);
    expect(shots.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(shots[1]?.notes).toContain('本格直接复用源图');
  });

  it('多机位按格序（行优先）排列', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const reversed: MultiGridPlan = { ...plan, cells: [...plan.cells].reverse() };
    const shots = multiGridCellsToShots(reversed);
    expect(shots.map((s) => s.shotType).slice(0, 3)).toEqual(['close', 'close', 'close']);
    expect(shots[shots.length - 1]?.shotType).toBe('wide');
  });
});

describe('⑧ 首帧：复用源图与已出图格', () => {
  it('画面推演「当前帧」指向源图；其余格无图时留空并告警', () => {
    const plan = buildMultiGridPlanForMode('frame-predict', SOURCE);
    const res = planMultiGridShots(plan, { cellImageUrls: ['', '', ''] });
    const current = res.shots.find((s) => s.notes?.includes('本格直接复用源图'))!;
    expect(current.firstFrameAssetId).toBe(SOURCE);
    expect(current.keyframeStatus).toBe('review');
    expect(res.shots.filter((s) => s.firstFrameAssetId === null)).toHaveLength(2);
    expect(res.warnings.some((w) => w.code === 'missing-cell-image')).toBe(true);
  });

  it('已出图的格写入该格首帧；源图为空时不编造', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const shots = multiGridCellsToShots(plan, {
      cellImageUrls: plan.cells.map((_, i) => (i === 4 ? '/media/grid/cell-4.png' : '')),
    });
    expect(shots[4]?.firstFrameAssetId).toBe('/media/grid/cell-4.png');
    expect(shots[4]?.status).toBe('review');
    expect(shots[0]?.firstFrameAssetId).toBeNull();
    expect(shots[0]?.status).toBe('draft');
  });

  it('源图地址缺失 → 明确告警且不写入首帧', () => {
    const plan = buildMultiGridPlanForMode('frame-predict', SOURCE);
    const withoutSource: MultiGridPlan = { ...plan, sourceUrl: '' };
    const res = planMultiGridShots(withoutSource);
    expect(res.warnings.some((w) => w.code === 'no-source-url')).toBe(true);
    expect(res.shots.every((s) => s.firstFrameAssetId === null)).toBe(true);
  });
});

describe('⑨ 防重键', () => {
  it('同一计划 + 同一批镜头 → 同键', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const a = planMultiGridShots(plan);
    const b = planMultiGridShots(plan);
    expect(a.key).toBe(b.key);
    expect(a.key.startsWith('mgw-')).toBe(true);
    expect(buildMultiGridShotWritebackKey(plan, a.shots)).toBe(a.key);
  });

  it('序号 / 时长 / 景别变化 → 键变化（可重新写回）', () => {
    const plan = buildMultiGridPlanForMode('multi-cam-9', SOURCE);
    const base = planMultiGridShots(plan);
    const longer = planMultiGridShots(plan, { defaultDurationSec: 4 });
    expect(longer.key).not.toBe(base.key);
    const shifted = planMultiGridShots(plan, { startIndex: 40 });
    expect(shifted.key).not.toBe(base.key);
    const editedPlan: MultiGridPlan = { ...plan, sourceUrl: '/media/other.png' };
    expect(planMultiGridShots(editedPlan).key).not.toBe(base.key);
  });

  it('计划不可用 → 空键', () => {
    expect(planMultiGridShots(undefined).key).toBe('');
    expect(planMultiGridShots({ mode: 'multi-cam-9' } as unknown as MultiGridPlan).key).toBe('');
  });
});

describe('⑩ 摘要与预览行', () => {
  it('describeMultiGridShotPlan：汇总新增镜数 / 序号区间 / 时长合计', () => {
    const plan = buildMultiGridPlanForMode('story-predict-4', SOURCE);
    const res = planMultiGridShots(plan, { upstreamShots: UPSTREAM, episodeId: 'ep-1' });
    const text = describeMultiGridShotPlan(res.shots);
    expect(text.split('\n')[0]).toContain('将新增 4 个镜头');
    expect(text.split('\n')[0]).toContain('序号 4–7');
    expect(text.split('\n')[0]).toContain('时长合计 14s');
    expect(text.split('\n')).toHaveLength(5);
  });

  it('空镜头 → 明确文案（不空成功）', () => {
    expect(describeMultiGridShotPlan([])).toContain('没有可生成的镜头');
    expect(buildMultiGridShotPreviewRows([])).toEqual([]);
  });

  it('预览行含序号 / 景别 / 时长 / 描述', () => {
    const rows = buildMultiGridShotPreviewRows(
      multiGridCellsToShots(buildMultiGridPlanForMode('multi-cam-9', SOURCE), { startIndex: 2 }),
    );
    expect(rows).toHaveLength(9);
    expect(rows[0]).toMatchObject({ index: 2, shotType: 'close', shotSizeLabel: '近景' });
    expect(rows[0]!.descriptionZh).toContain('左前 45°');
  });
});

describe('⑪ 异常输入：纯函数不抛异常，如实告警', () => {
  it('undefined / 非对象 / cells 非数组 / cells 为空', () => {
    expect(() => multiGridCellsToShots(undefined)).not.toThrow();
    expect(planMultiGridShots(undefined).ok).toBe(false);
    expect(planMultiGridShots(undefined).warnings[0]?.code).toBe('invalid-plan');

    const notObject = planMultiGridShots('nope' as unknown as MultiGridPlan);
    expect(notObject.ok).toBe(false);
    expect(notObject.shots).toEqual([]);

    const noCells = planMultiGridShots({ mode: 'multi-cam-9', rows: 3, cols: 3, aspectRatio: '16:9', sourceUrl: SOURCE, cells: null as unknown as [], notesZh: '' });
    expect(noCells.ok).toBe(false);
    expect(noCells.warnings[0]?.code).toBe('invalid-plan');

    const empty = planMultiGridShots({ mode: 'multi-cam-9', rows: 3, cols: 3, aspectRatio: '16:9', sourceUrl: SOURCE, cells: [], notesZh: '' });
    expect(empty.ok).toBe(false);
    expect(empty.warnings[0]?.messageZh).toContain('没有任何格');
  });

  it('结果可 JSON 序列化（节点 data / 持久化安全）', () => {
    const res = planMultiGridShots(buildMultiGridPlanForMode('multi-cam-9', SOURCE), {
      upstreamShots: UPSTREAM,
      cellImageUrls: [SOURCE],
    });
    expect(() => JSON.stringify(res)).not.toThrow();
    expect(JSON.parse(JSON.stringify(res)).shots).toHaveLength(9);
  });
});

describe('⑫ 分镜台拆镜结构插入', () => {
  it('插入到指定分集末位并重排序号；不改入参', () => {
    const payload = breakdownPayload();
    const snapshot = JSON.stringify(payload);
    const shots = multiGridCellsToShots(buildMultiGridPlanForMode('story-predict-4', SOURCE), {
      upstreamShots: UPSTREAM,
      episodeId: 'ep-1',
    });
    const res = insertMultiGridShotsIntoBreakdown(payload, shots, { episodeId: 'ep-1' });
    expect(res.ok).toBe(true);
    expect(res.episodeId).toBe('ep-1');
    expect(res.insertedIds).toEqual(shots.map((s) => s.id));
    expect(JSON.stringify(payload)).toBe(snapshot);
    const episode = res.payload!.episodes.find((ep) => ep.id === 'ep-1')!;
    expect(episode.shots).toHaveLength(5);
    expect(episode.shots.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    // 场次沿用锚点（同集末镜），剧情推演没有景别 → 不写非法 shotSize
    expect(episode.shots[1]?.sceneCode).toBe('1-1');
    expect(episode.shots[1]?.shotSize).toBeUndefined();
    expect(episode.shots[1]?.status).toBe('draft');
    expect(episode.shots[1]?.scriptText).toContain('起因确立');
  });

  it('多机位插入带景别枚举与运镜（落进拆镜枚举）', () => {
    const shots = multiGridCellsToShots(buildMultiGridPlanForMode('multi-cam-9', SOURCE));
    const converted = multiGridShotsToBreakdownShots(shots, {
      episodeId: 'ep-1',
      episodeIndex: 1,
      anchor: breakdownPayload().episodes[0]!.shots[0]!,
    });
    expect(converted[0]?.shotSize).toBe('CU');
    expect(converted[3]?.shotSize).toBe('MS');
    expect(converted[6]?.shotSize).toBe('WS');
    expect(converted.every((s) => s.cameraMove === '固定')).toBe(true);
    expect(converted[0]?.videoPrompt).toContain('locked-off');
  });

  it('同 id 再插 → 不重复插入并给出中文原因', () => {
    const payload = breakdownPayload();
    const shots = multiGridCellsToShots(buildMultiGridPlanForMode('story-predict-4', SOURCE), {
      episodeId: 'ep-1',
    });
    const first = insertMultiGridShotsIntoBreakdown(payload, shots, { episodeId: 'ep-1' });
    const second = insertMultiGridShotsIntoBreakdown(first.payload, shots, { episodeId: 'ep-1' });
    expect(second.ok).toBe(false);
    expect(second.payload).toBeUndefined();
    expect(second.reasonZh).toContain('未重复插入');
    expect(first.payload!.episodes[0]!.shots).toHaveLength(5);
  });

  it('分集不存在 / 没有拆镜结构 / 空镜头 → 明确原因，不写别的集', () => {
    const shots = multiGridCellsToShots(buildMultiGridPlanForMode('story-predict-4', SOURCE));
    const missingEpisode = insertMultiGridShotsIntoBreakdown(breakdownPayload(), shots, { episodeId: 'ep-9' });
    expect(missingEpisode.ok).toBe(false);
    expect(missingEpisode.reasonZh).toContain('没有分集');
    const noPayload = insertMultiGridShotsIntoBreakdown(undefined, shots, { episodeId: 'ep-1' });
    expect(noPayload.ok).toBe(false);
    expect(noPayload.reasonZh).toContain('还没有拆镜结果');
    const emptyShots = insertMultiGridShotsIntoBreakdown(breakdownPayload(), []);
    expect(emptyShots.ok).toBe(false);
    expect(emptyShots.reasonZh).toContain('没有可插入的镜头');
  });

  it('resolveMultiGridBreakdownAnchor：锚点取该集末镜，缺省回落首集', () => {
    const payload = breakdownPayload();
    expect(resolveMultiGridBreakdownAnchor(payload, 'ep-1').anchor?.id).toBe('shot-1');
    expect(resolveMultiGridBreakdownAnchor(payload, 'ep-2')).toMatchObject({
      episodeId: 'ep-2',
      episodeIndex: 2,
      anchor: null,
    });
    expect(resolveMultiGridBreakdownAnchor(undefined, null).anchor).toBeNull();
  });
});
