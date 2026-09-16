/**
 * 多格推演构造器回归（增量新增能力）。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：packages/shared/src/index.ts 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖本次新增的构造器与类型，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  MULTI_GRID_CLIP_SEC,
  MULTI_GRID_DEFAULT_NEGATIVE,
  MULTI_GRID_MODES,
  buildFramePredictPlan,
  buildMultiCamPlan,
  buildMultiGridPlanForMode,
  buildStoryPredictPlan,
  focalLengthToHorizontalFov,
  isMultiGridMode,
  planCellsToGridCellPrompts,
  planToGridReverseResult,
  readMultiGridMode,
  resolveCameraPositionHint,
} from '../../../../../packages/shared/src/utils/multi-grid-plan';

const SOURCE = '/media/uploads/keyframe-01.png';

describe('多机位宫格：方位 × 景别矩阵', () => {
  it('9 宫格 = 3×3，格数 / 下标 / 机位标签齐备', () => {
    const plan = buildMultiCamPlan(SOURCE, { rows: 3, cols: 3 });
    expect(plan.mode).toBe('multi-cam-9');
    expect(plan.rows).toBe(3);
    expect(plan.cols).toBe(3);
    expect(plan.cells).toHaveLength(9);
    expect(plan.sourceUrl).toBe(SOURCE);

    const roles = plan.cells.map((c) => c.role);
    expect(new Set(roles).size).toBe(9);
    plan.cells.forEach((cell, i) => {
      expect(cell.cellIndex).toBe(i);
      expect(cell.row).toBe(Math.floor(i / 3));
      expect(cell.col).toBe(i % 3);
      expect(cell.cameraAngleLabel).toBeTruthy();
      expect(cell.shotSizeLabel).toBeTruthy();
      expect(cell.role).toBe(`${cell.cameraAngleLabel} · ${cell.shotSizeLabel}`);
      expect(cell.imagePromptZh).not.toContain('undefined');
      expect(cell.endFramePrompt).toBe('');
      expect(cell.needsEndFrame).toBe(false);
    });
    // 机位标签真实可读：如「左前 45° · 中景」
    expect(roles).toContain('左前 45° · 中景');
    expect(roles).toContain('正前 0° · 全景');
  });

  it('25 宫格 = 5×5，含 ±90° 侧机位与特写 / 大远景', () => {
    const plan = buildMultiCamPlan(SOURCE, { rows: 5, cols: 5 });
    expect(plan.mode).toBe('multi-cam-25');
    expect(plan.cells).toHaveLength(25);
    const azimuths = new Set(plan.cells.map((c) => c.cameraAngleLabel));
    expect(azimuths).toEqual(
      new Set(['左侧 90°', '左前 45°', '正前 0°', '右前 45°', '右侧 90°']),
    );
    const sizes = new Set(plan.cells.map((c) => c.shotSizeLabel));
    expect(sizes).toEqual(new Set(['特写', '近景', '中景', '全景', '大远景']));
  });

  it('每格复述主体一致性措辞，并带机位坐标提示与焦距', () => {
    const plan = buildMultiCamPlan(SOURCE, { focalRange: [24, 85] });
    for (const cell of plan.cells) {
      expect(cell.imagePromptZh).toContain('同一角色外貌');
      expect(cell.imagePromptZh).toContain('本格只改变机位与景别');
      expect(cell.imagePrompt).toContain('same character identity');
      expect(cell.cameraPositionHint).toMatch(/x=-?\d/);
      expect(cell.cameraPositionHint).toContain('相对主体');
      expect(cell.cameraHeightM).toBeGreaterThan(0);
      expect(cell.focalLengthMm).toBeGreaterThanOrEqual(24);
      expect(cell.focalLengthMm).toBeLessThanOrEqual(85);
      expect(cell.imagePromptZh).toContain(`${cell.focalLengthMm}mm`);
      expect(cell.negativePrompt).toBe(MULTI_GRID_DEFAULT_NEGATIVE);
    }
  });

  it('焦段区间被真实用于换算，且视角随焦距变窄', () => {
    const plan = buildMultiCamPlan(SOURCE, { focalRange: [20, 200] });
    const focals = plan.cells.map((c) => c.focalLengthMm!);
    expect(Math.min(...focals)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...focals)).toBeLessThanOrEqual(200);
    const wide = plan.cells.find((c) => c.shotSizeLabel === '全景')!;
    const close = plan.cells.find((c) => c.shotSizeLabel === '近景')!;
    expect(close.focalLengthMm!).toBeGreaterThan(wide.focalLengthMm!);
    expect(focalLengthToHorizontalFov(50)).toBeCloseTo(39.6, 1);
    expect(focalLengthToHorizontalFov(18)).toBeGreaterThan(focalLengthToHorizontalFov(85));
  });

  it('非法宫格规格与缺失源图直接报错（禁止空成功）', () => {
    expect(() => buildMultiCamPlan(SOURCE, { rows: 4, cols: 4 })).toThrow(/3×3（9 格）或 5×5/);
    expect(() => buildMultiCamPlan(SOURCE, { rows: 3, cols: 5 })).toThrow();
    expect(() => buildMultiCamPlan('   ')).toThrow(/缺少源图/);
  });

  it('notesZh 声明机位 / 焦距为建议值而非实测', () => {
    const plan = buildMultiCamPlan(SOURCE);
    expect(plan.notesZh).toContain('建议值');
    expect(plan.notesZh).toContain('不是对源图的测量结果');
  });
});

describe('剧情推演四宫格', () => {
  it('四格为起因 → 冲突 → 转折 → 收束钩子', () => {
    const plan = buildStoryPredictPlan(SOURCE);
    expect(plan.mode).toBe('story-predict-4');
    expect(plan.rows).toBe(2);
    expect(plan.cols).toBe(2);
    expect(plan.cells.map((c) => c.role)).toEqual([
      '起因确立',
      '冲突升级',
      '转折',
      '收束 · 钩子',
    ]);
    plan.cells.forEach((cell, i) => {
      expect(cell.cellIndex).toBe(i);
      expect(cell.row).toBe(Math.floor(i / 2));
      expect(cell.col).toBe(i % 2);
      expect(cell.imagePromptZh).toContain('同一主体与同一场景基准');
      expect(cell.imagePrompt).toContain('Same character identity');
      expect(cell.timeOffsetSec).toBeUndefined();
      expect(cell.needsEndFrame).toBe(false);
    });
  });

  it('自定义节拍与剧情方向写入对应格', () => {
    const plan = buildStoryPredictPlan(SOURCE, {
      beats: ['雨夜街头，主角接到匿名电话', { zh: '对手现身', en: 'the rival steps in' }],
      direction: '雨夜追逐',
    });
    expect(plan.cells).toHaveLength(4);
    expect(plan.cells[0]!.imagePromptZh).toContain('雨夜街头，主角接到匿名电话');
    expect(plan.cells[0]!.imagePromptZh).toContain('剧情方向：雨夜追逐');
    expect(plan.cells[1]!.imagePromptZh).toContain('对手现身');
    expect(plan.cells[1]!.imagePrompt).toContain('the rival steps in');
    expect(plan.notesZh).toContain('雨夜追逐');
    // 未给英文的节拍：英文稿保留内置节拍并附中文原意，避免中英不一致
    expect(plan.cells[0]!.imagePrompt).toContain('keep the meaning');
  });

  it('超过 4 条节拍只取前 4 条', () => {
    const plan = buildStoryPredictPlan(SOURCE, { beats: ['a', 'b', 'c', 'd', 'e'] });
    expect(plan.cells).toHaveLength(4);
  });
});

describe('画面推演：N 秒前 / 当前 / M 秒后', () => {
  it('默认 5 秒前 / 当前 / 3 秒后，当前格复用源图', () => {
    const plan = buildFramePredictPlan(SOURCE);
    expect(plan.mode).toBe('frame-predict');
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(3);
    expect(plan.cells.map((c) => c.role)).toEqual(['5 秒前', '当前（源图）', '3 秒后']);
    expect(plan.cells.map((c) => c.timeOffsetSec)).toEqual([-5, 0, 3]);
    expect(plan.cells[1]!.reuseSourceImage).toBe(true);
    expect(plan.cells[0]!.reuseSourceImage).toBe(false);
    expect(plan.cells[2]!.reuseSourceImage).toBe(false);
  });

  it('前后格互为收尾帧：前格尾帧指向当前，当前格尾帧指向后续', () => {
    const plan = buildFramePredictPlan(SOURCE, { beforeSec: 4, afterSec: 6 });
    expect(plan.cells[0]!.role).toBe('4 秒前');
    expect(plan.cells[2]!.role).toBe('6 秒后');
    expect(plan.cells[0]!.needsEndFrame).toBe(true);
    expect(plan.cells[0]!.endFramePrompt).toContain('current reference frame');
    expect(plan.cells[1]!.needsEndFrame).toBe(true);
    expect(plan.cells[1]!.endFramePromptZh).toContain('6 秒后');
    expect(plan.cells[2]!.needsEndFrame).toBe(false);
    expect(plan.cells[2]!.endFramePrompt).toBe('');
  });

  it('自定义运动描述写入前后格，秒数非法时报错', () => {
    const plan = buildFramePredictPlan(SOURCE, {
      motionZh: '人物缓慢转身',
      motionEn: 'the character turns slowly',
    });
    expect(plan.cells[0]!.imagePromptZh).toContain('人物缓慢转身');
    expect(plan.cells[2]!.imagePrompt).toContain('the character turns slowly');
    expect(() => buildFramePredictPlan(SOURCE, { beforeSec: 0 })).toThrow(/1–120/);
    expect(() => buildFramePredictPlan(SOURCE, { afterSec: -3 })).toThrow(/1–120/);
    expect(() => buildFramePredictPlan('')).toThrow(/缺少源图/);
  });
});

describe('统一入口与下游兼容转换', () => {
  it('buildMultiGridPlanForMode 覆盖四种模式且与目录声明格数一致', () => {
    for (const def of MULTI_GRID_MODES) {
      const plan = buildMultiGridPlanForMode(def.id, SOURCE);
      expect(plan.mode).toBe(def.id);
      expect(plan.cells).toHaveLength(def.cellCount);
      expect(plan.rows).toBe(def.rows);
      expect(plan.cols).toBe(def.cols);
    }
  });

  it('模式读取容错：非法值回落多机位 9 宫格', () => {
    expect(isMultiGridMode('multi-cam-9')).toBe(true);
    expect(isMultiGridMode('nope')).toBe(false);
    expect(readMultiGridMode(undefined)).toBe('multi-cam-9');
    expect(readMultiGridMode('frame-predict')).toBe('frame-predict');
  });

  it('planCellsToGridCellPrompts 产出与 GridCellPrompt 同构的中英三层提示词', () => {
    const plan = buildMultiCamPlan(SOURCE);
    const urls = plan.cells.map((_, i) => `/media/gen/cell-${i}.png`);
    const cells = planCellsToGridCellPrompts(plan, urls);
    expect(cells).toHaveLength(9);
    cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
      expect(cell.row).toBe(plan.cells[i]!.row);
      expect(cell.col).toBe(plan.cells[i]!.col);
      expect(cell.cellImageUrl).toBe(urls[i]);
      expect(cell.imagePrompt).toBe(plan.cells[i]!.imagePrompt);
      expect(cell.imagePromptZh).toBe(plan.cells[i]!.imagePromptZh);
      expect(cell.videoPrompt.trim()).not.toBe('');
      expect(cell.videoPromptZh.trim()).not.toBe('');
      expect(cell.needsEndFrame).toBe(false);
      expect(cell.endFramePromptZh).toBe('');
    });
    expect(cells[0]!.videoPromptZh).toContain('多机位单镜');
  });

  it('画面推演的当前格在转换后仍指向源图', () => {
    const plan = buildFramePredictPlan(SOURCE);
    const cells = planCellsToGridCellPrompts(plan, ['/media/gen/before.png', '', '/media/gen/after.png']);
    expect(cells[1]!.cellImageUrl).toBe(SOURCE);
    expect(cells[1]!.endFramePrompt).not.toBe('');
    expect(cells[1]!.endFrameReason).toContain('当前（源图）');
  });

  it('planToGridReverseResult 与 GridReversePromptsResult 兼容', () => {
    const plan = buildStoryPredictPlan(SOURCE);
    const urls = plan.cells.map((_, i) => `/media/gen/beat-${i}.png`);
    const result = planToGridReverseResult(plan, urls);
    expect(result.ok).toBe(true);
    expect(result.rows).toBe(2);
    expect(result.cols).toBe(2);
    expect(result.sourceUrl).toBe(SOURCE);
    expect(result.splitUrls).toEqual(urls);
    expect(result.cells).toHaveLength(4);
    expect(result.cells.every((c) => c.videoPrompt.length > 0)).toBe(true);
    expect(MULTI_GRID_CLIP_SEC).toBeGreaterThan(0);
  });

  it('一图未出时 ok=false（不假绿）', () => {
    const plan = buildMultiCamPlan(SOURCE);
    const result = planToGridReverseResult(plan, []);
    expect(result.ok).toBe(false);
    expect(result.splitUrls).toEqual([]);
    expect(result.cells).toHaveLength(9);
  });

  it('纯函数：可序列化、可重复、不修改入参', () => {
    const options: { focalRange: [number, number] } = { focalRange: [24, 85] };
    const first = buildMultiCamPlan(SOURCE, options);
    const second = buildMultiCamPlan(SOURCE, options);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(second).toEqual(first);
    expect(options).toEqual({ focalRange: [24, 85] });
  });

  it('机位坐标换算按方位角给出左右符号', () => {
    expect(resolveCameraPositionHint(-45, 4, 1.6)).toContain('x=-2.83');
    expect(resolveCameraPositionHint(45, 4, 1.6)).toContain('x=2.83');
    expect(resolveCameraPositionHint(0, 4, 1.6)).toContain('z=4');
  });
});
