/**
 * 角色设定表 / 三视图构造器回归（增量新增能力）。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：packages/shared/src/index.ts 目前引用了 8 个尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖本次新增的构造器与既有预设，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_SHEET_CLIP_SEC,
  CHARACTER_SHEET_CONSISTENCY_LEVELS,
  CHARACTER_SHEET_DEFAULT_NEGATIVE,
  CHARACTER_SHEET_KINDS,
  TURNAROUND_ANGLE_IDS,
  buildCharacterSheetConsistencyPrompt,
  buildCharacterSheetConsistencySummaryZh,
  buildCharacterSheetPlan,
  characterSheetPlanToGridCells,
  characterSheetPlanToGridResult,
  characterSheetSubjectFromProfile,
  collectCharacterSheetSubjectWarnings,
  isCharacterSheetKind,
  lookupCharacterSheetConsistency,
  lookupCharacterSheetKindDef,
  readCharacterSheetConsistency,
  readCharacterSheetKind,
} from '../../../../../packages/shared/src/utils/character-sheet-plan';
import { ANGLE_PRESETS } from '../../../../../packages/shared/src/data/anime-tag-presets';
import {
  CHARACTER_EXPRESSION_PRESETS,
  CHARACTER_SHEET_POSE_PRESETS,
} from '../../../../../packages/shared/src/data/character-sheet-presets';
import type { CharacterProfile } from '../../../../../packages/shared/src/types/character';

const REF = '/media/library/characters/lin-chuan-ref.png';

const SUBJECT = {
  characterId: 'char-1',
  name: '林川',
  appearanceZh: '黑色长发、左眉尾有疤、窄脸',
  outfitZh: '深蓝高领风衣、皮质手套',
  styleZh: '赛璐璐平涂，冷色调',
  paletteZh: '深蓝 / 灰白 / 一点朱红',
  referenceImageUrl: REF,
};

describe('角色设定表：版面格数与标签', () => {
  it('三视图 = 4 视角（正 / 3-4 侧 / 侧 / 背），角度取自既有角度预设', () => {
    const plan = buildCharacterSheetPlan('turnaround', { subject: SUBJECT, sourceRef: REF });
    expect(plan.kind).toBe('turnaround');
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(4);
    expect(plan.cells).toHaveLength(4);

    expect(plan.cells.map((c) => c.angleId)).toEqual([
      'front',
      'three-quarter',
      'side',
      'back',
    ]);
    const roles = plan.cells.map((c) => c.role);
    expect(roles).toEqual([
      '三视图 · 正面',
      '三视图 · 3/4 侧',
      '三视图 · 侧面',
      '三视图 · 背面',
    ]);
    plan.cells.forEach((cell, i) => {
      expect(cell.cellIndex).toBe(i);
      expect(cell.section).toBe('turnaround');
      expect(cell.row).toBe(0);
      expect(cell.col).toBe(i);
      expect(cell.angleLabel).toBe(ANGLE_PRESETS.find((p) => p.id === cell.angleId)!.label);
      expect(cell.expressionId).toBeUndefined();
      expect(cell.poseId).toBeUndefined();
      // 换角度不换人：每格都写明只改视角
      expect(cell.imagePromptZh).toContain('本格只把视角转到该角度');
      expect(cell.imagePrompt).toContain('full body in frame');
    });
    expect(TURNAROUND_ANGLE_IDS).toEqual(['front', 'three-quarter', 'side', 'back']);
  });

  it('表情表逐格取自既有角色表情预设，次序与 id 完全一致', () => {
    const plan = buildCharacterSheetPlan('expression', { subject: SUBJECT, sourceRef: REF });
    expect(plan.cells).toHaveLength(CHARACTER_EXPRESSION_PRESETS.length);
    expect(plan.cells).toHaveLength(10);
    expect(plan.rows).toBe(2);
    expect(plan.cols).toBe(5);
    expect(plan.cells.map((c) => c.expressionId)).toEqual(
      CHARACTER_EXPRESSION_PRESETS.map((p) => p.id),
    );
    expect(plan.cells.map((c) => c.expressionLabel)).toEqual(
      CHARACTER_EXPRESSION_PRESETS.map((p) => p.label),
    );
    expect(plan.cells[0]!.role).toBe('表情 · 平静');
    plan.cells.forEach((cell) => {
      const preset = CHARACTER_EXPRESSION_PRESETS.find((p) => p.id === cell.expressionId)!;
      expect(cell.imagePrompt).toContain(preset.tags);
      expect(cell.imagePromptZh).toContain(preset.label);
      expect(cell.imagePromptZh).toContain('只改面部表情');
      expect(cell.angleId).toBeUndefined();
    });
  });

  it('动作表逐格取自既有角色设定动作预设', () => {
    const plan = buildCharacterSheetPlan('pose', { subject: SUBJECT, sourceRef: REF });
    expect(plan.cells).toHaveLength(CHARACTER_SHEET_POSE_PRESETS.length);
    expect(plan.cells).toHaveLength(5);
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(5);
    expect(plan.cells.map((c) => c.poseId)).toEqual(
      CHARACTER_SHEET_POSE_PRESETS.map((p) => p.id),
    );
    expect(plan.cells[1]!.role).toBe('动作 · 战斗');
    plan.cells.forEach((cell) => {
      const preset = CHARACTER_SHEET_POSE_PRESETS.find((p) => p.id === cell.poseId)!;
      expect(cell.imagePrompt).toContain(preset.tags);
      expect(cell.imagePromptZh).toContain('只改整体动作');
    });
  });

  it('全套设定表 = 三视图 4 + 表情 10 + 动作 5，行列自算为 4×5', () => {
    const plan = buildCharacterSheetPlan('full', { subject: SUBJECT, sourceRef: REF });
    expect(plan.cells).toHaveLength(19);
    expect(plan.rows).toBe(4);
    expect(plan.cols).toBe(5);
    const sections = plan.cells.map((c) => c.section);
    expect(sections.filter((s) => s === 'turnaround')).toHaveLength(4);
    expect(sections.filter((s) => s === 'expression')).toHaveLength(10);
    expect(sections.filter((s) => s === 'pose')).toHaveLength(5);
    // 行优先铺格：row = floor(i / cols)
    plan.cells.forEach((cell, i) => {
      expect(cell.cellIndex).toBe(i);
      expect(cell.row).toBe(Math.floor(i / plan.cols));
      expect(cell.col).toBe(i % plan.cols);
    });
    expect(plan.cells[0]!.role).toBe('三视图 · 正面');
    expect(plan.cells[4]!.role).toBe('表情 · 平静');
    expect(plan.cells[14]!.role).toBe('动作 · 站立');
    expect(plan.notesZh).toContain('三视图 4 格 → 表情 10 格 → 动作 5 格');
  });

  it('目录声明的格数与实际构造结果一致', () => {
    for (const def of CHARACTER_SHEET_KINDS) {
      const plan = buildCharacterSheetPlan(def.id, { subject: SUBJECT, sourceRef: REF });
      expect(plan.kind).toBe(def.id);
      expect(plan.cells).toHaveLength(def.cellCount);
      expect(plan.rows).toBe(def.rows);
      expect(plan.cols).toBe(def.cols);
      expect(def.label).toBeTruthy();
      expect(def.hint).toBeTruthy();
    }
  });
});

describe('角色设定表：一致性锁定', () => {
  it('同一段锁定短语复述进每一格（中英各自复述）', () => {
    const plan = buildCharacterSheetPlan('full', { subject: SUBJECT, sourceRef: REF });
    expect(plan.consistencyLock).toContain('林川');
    expect(plan.consistencyLock).toContain('黑色长发');
    expect(plan.consistencyLock).toContain('locked wardrobe: 深蓝高领风衣、皮质手套');
    expect(plan.consistencySummaryZh).toContain('林川');
    expect(plan.consistencySummaryZh).toContain('服装 深蓝高领风衣、皮质手套');
    for (const cell of plan.cells) {
      expect(cell.imagePrompt).toContain(plan.consistencyLock);
      expect(cell.imagePromptZh).toContain(plan.consistencySummaryZh);
      expect(cell.imagePrompt).toContain('no identity drift');
    }
  });

  it('一致性档位决定图生图强度：严格 < 标准 < 宽松', () => {
    const strengths = CHARACTER_SHEET_CONSISTENCY_LEVELS.map((l) => l.strength);
    expect(strengths[2]!).toBeLessThan(strengths[1]!);
    expect(strengths[1]!).toBeLessThan(strengths[0]!);
    for (const level of CHARACTER_SHEET_CONSISTENCY_LEVELS) {
      const plan = buildCharacterSheetPlan('turnaround', {
        subject: SUBJECT,
        sourceRef: REF,
        consistency: level.id,
      });
      expect(plan.consistency).toBe(level.id);
      expect(plan.consistencyStrength).toBe(level.strength);
      expect(plan.cells.every((c) => c.imagePrompt.includes(level.enClause))).toBe(true);
      expect(plan.cells.every((c) => c.imagePromptZh.includes(level.zhClause))).toBe(true);
    }
    expect(lookupCharacterSheetConsistency('nope').id).toBe('standard');
  });

  it('负面提示词默认档叠加节点追加项，逐格一致', () => {
    const plan = buildCharacterSheetPlan('turnaround', {
      subject: SUBJECT,
      sourceRef: REF,
      extraNegative: '戴眼镜、换发型',
    });
    expect(CHARACTER_SHEET_DEFAULT_NEGATIVE).toContain('identity drift');
    for (const cell of plan.cells) {
      expect(cell.negativePrompt).toContain(CHARACTER_SHEET_DEFAULT_NEGATIVE);
      expect(cell.negativePrompt).toContain('戴眼镜、换发型');
    }
  });

  it('buildCharacterSheetConsistencyPrompt 缺信息时给通用锁定，不编造角色设定', () => {
    const empty = buildCharacterSheetConsistencyPrompt({});
    expect(empty).toContain('no identity drift');
    expect(empty).not.toContain('undefined');
    const named = buildCharacterSheetConsistencyPrompt({ name: '林川' });
    expect(named).toContain('林川');
  });

  it('一致性摘要如实标注缺项，不编造', () => {
    expect(buildCharacterSheetConsistencySummaryZh({})).toContain('未具名角色');
    expect(buildCharacterSheetConsistencySummaryZh({})).toContain('未提供外观 / 服装 / 画风描述');
    expect(buildCharacterSheetConsistencySummaryZh({ name: '林川' })).toBe(
      '林川（未提供外观 / 服装 / 画风描述）',
    );
  });
});

describe('角色设定表：缺角色信息给告警而非编造', () => {
  it('空角色设定：4 条明确告警，仍然产出可编辑版面', () => {
    const plan = buildCharacterSheetPlan('turnaround');
    expect(plan.cells).toHaveLength(4);
    expect(plan.sourceRef).toBe('');
    expect(plan.warningsZh.length).toBe(4);
    expect(plan.warningsZh.join('\n')).toContain('未指定角色名');
    expect(plan.warningsZh.join('\n')).toContain('缺少角色外观描述');
    expect(plan.warningsZh.join('\n')).toContain('未提供服装 / 造型描述');
    expect(plan.warningsZh.join('\n')).toContain('未提供参考图');
    expect(plan.notesZh).toContain('未提供参考图');
  });

  it('角色信息齐备时不产生告警', () => {
    const plan = buildCharacterSheetPlan('turnaround', { subject: SUBJECT, sourceRef: REF });
    expect(plan.warningsZh).toEqual([]);
  });

  it('缺服装单项时只报该项，其余不夸大', () => {
    const plan = buildCharacterSheetPlan('turnaround', {
      subject: { ...SUBJECT, outfitZh: '' },
      sourceRef: REF,
    });
    expect(plan.warningsZh).toEqual(['未提供服装 / 造型描述：逐格的服装一致性无法锁定。']);
  });

  it('collectCharacterSheetSubjectWarnings 可独立调用（面板同口径）', () => {
    expect(collectCharacterSheetSubjectWarnings({}, '')).toHaveLength(4);
    expect(collectCharacterSheetSubjectWarnings(SUBJECT, REF)).toEqual([]);
    // 用描述代替参考图时，仍视为有外观锚点
    expect(
      collectCharacterSheetSubjectWarnings({ name: '林川', referenceNoteZh: '黑衣剑客' }, ''),
    ).toEqual(['未提供服装 / 造型描述：逐格的服装一致性无法锁定。', expect.stringContaining('未提供参考图')]);
  });
});

describe('角色设定表：行列自算与覆盖', () => {
  it('行列覆盖仅在容得下全部格时生效', () => {
    const ok = buildCharacterSheetPlan('turnaround', {
      subject: SUBJECT,
      sourceRef: REF,
      rows: 2,
      cols: 2,
    });
    expect(ok.rows).toBe(2);
    expect(ok.cols).toBe(2);
    expect(ok.cells.map((c) => [c.row, c.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(ok.warningsZh).toEqual([]);
  });

  it('行列容不下全部格时回落默认几何并告警（不抛异常、不丢格）', () => {
    const plan = buildCharacterSheetPlan('expression', {
      subject: SUBJECT,
      sourceRef: REF,
      rows: 2,
      cols: 2,
    });
    expect(plan.cells).toHaveLength(10);
    expect(plan.rows).toBe(2);
    expect(plan.cols).toBe(5);
    expect(plan.warningsZh.join('\n')).toContain('容不下 10 格');
  });

  it('非法行列值被忽略（回落默认几何）', () => {
    const plan = buildCharacterSheetPlan('pose', { rows: 0, cols: -3 });
    expect(plan.rows).toBe(1);
    expect(plan.cols).toBe(5);
  });

  it('整套版面允许 5×4 等其它容得下的几何', () => {
    const plan = buildCharacterSheetPlan('full', { rows: 5, cols: 4, subject: SUBJECT });
    expect(plan.rows).toBe(5);
    expect(plan.cols).toBe(4);
    expect(plan.cells).toHaveLength(19);
    plan.cells.forEach((cell, i) => {
      expect(cell.row).toBe(Math.floor(i / 4));
      expect(cell.col).toBe(i % 4);
    });
  });
});

describe('角色设定表：默认宽高比与读取容错', () => {
  it('按版面给默认单格宽高比，可被覆盖', () => {
    expect(buildCharacterSheetPlan('turnaround').aspectRatio).toBe('3:4');
    expect(buildCharacterSheetPlan('expression').aspectRatio).toBe('1:1');
    expect(buildCharacterSheetPlan('pose').aspectRatio).toBe('3:4');
    expect(buildCharacterSheetPlan('full').aspectRatio).toBe('3:4');
    expect(buildCharacterSheetPlan('turnaround', { aspectRatio: '2k' }).aspectRatio).toBe('2k');
  });

  it('版面类型读取容错：非法值回落三视图，并给出告警', () => {
    expect(isCharacterSheetKind('full')).toBe(true);
    expect(isCharacterSheetKind('nope')).toBe(false);
    expect(readCharacterSheetKind(undefined)).toBe('turnaround');
    expect(readCharacterSheetKind('expression')).toBe('expression');
    expect(readCharacterSheetConsistency('strict')).toBe('strict');
    expect(readCharacterSheetConsistency('whatever')).toBe('standard');
    expect(lookupCharacterSheetKindDef('full').label).toBe('全套设定表');

    const plan = buildCharacterSheetPlan('nope' as never);
    expect(plan.kind).toBe('turnaround');
    expect(plan.warningsZh.join('\n')).toContain('未知角色设定表版面');
  });
});

describe('角色设定表：下游 GridCellPrompt 兼容', () => {
  it('characterSheetPlanToGridCells 产出与 GridCellPrompt 同构的中英三层提示词', () => {
    const plan = buildCharacterSheetPlan('turnaround', { subject: SUBJECT, sourceRef: REF });
    const urls = plan.cells.map((_, i) => `/media/gen/sheet-${i}.png`);
    const cells = characterSheetPlanToGridCells(plan, urls);
    expect(cells).toHaveLength(4);
    cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
      expect(cell.row).toBe(plan.cells[i]!.row);
      expect(cell.col).toBe(plan.cells[i]!.col);
      expect(cell.cellImageUrl).toBe(urls[i]);
      expect(cell.imagePrompt).toBe(plan.cells[i]!.imagePrompt);
      expect(cell.imagePromptZh).toBe(plan.cells[i]!.imagePromptZh);
      expect(cell.videoPrompt.trim()).not.toBe('');
      expect(cell.videoPromptZh.trim()).not.toBe('');
      expect(cell.videoPromptZh).toContain('立绘微动');
      expect(cell.needsEndFrame).toBe(false);
      expect(cell.endFramePrompt).toBe('');
      expect(cell.endFramePromptZh).toBe('');
    });
    expect(CHARACTER_SHEET_CLIP_SEC).toBe(3);
  });

  it('characterSheetPlanToGridResult 与 GridReversePromptsResult 兼容', () => {
    const plan = buildCharacterSheetPlan('pose', { subject: SUBJECT, sourceRef: REF });
    const urls = plan.cells.map((_, i) => `/media/gen/pose-${i}.png`);
    const result = characterSheetPlanToGridResult(plan, urls);
    expect(result.ok).toBe(true);
    expect(result.rows).toBe(1);
    expect(result.cols).toBe(5);
    expect(result.sourceUrl).toBe(REF);
    expect(result.splitUrls).toEqual(urls);
    expect(result.cells).toHaveLength(5);
    expect(result.cells.every((c) => c.videoPrompt.length > 0)).toBe(true);
  });

  it('一图未出时 ok=false（不假绿），缺格不补齐', () => {
    const plan = buildCharacterSheetPlan('turnaround', { subject: SUBJECT, sourceRef: REF });
    const result = characterSheetPlanToGridResult(plan, ['/media/gen/a.png', '', '', '']);
    expect(result.ok).toBe(true);
    expect(result.splitUrls).toEqual(['/media/gen/a.png']);
    expect(characterSheetPlanToGridResult(plan, []).ok).toBe(false);
    expect(characterSheetPlanToGridResult(plan, []).splitUrls).toEqual([]);
  });
});

describe('角色设定表：纯函数性质', () => {
  it('可序列化、可重复、不修改入参', () => {
    const options = { subject: { ...SUBJECT }, sourceRef: REF, consistency: 'strict' as const };
    const first = buildCharacterSheetPlan('full', options);
    const second = buildCharacterSheetPlan('full', options);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(second).toEqual(first);
    expect(options).toEqual({ subject: { ...SUBJECT }, sourceRef: REF, consistency: 'strict' });
    expect(Object.keys(first).sort()).toEqual(
      [
        'aspectRatio',
        'cells',
        'cols',
        'consistency',
        'consistencyLock',
        'consistencyStrength',
        'consistencySummaryZh',
        'kind',
        'notesZh',
        'rows',
        'sourceRef',
        'warningsZh',
      ].sort(),
    );
  });

  it('任何输入都不抛异常（含空选项与非法覆盖）', () => {
    for (const kind of ['turnaround', 'expression', 'pose', 'full'] as const) {
      expect(() => buildCharacterSheetPlan(kind)).not.toThrow();
      expect(() =>
        buildCharacterSheetPlan(kind, { rows: -1, cols: 99999, aspectRatio: '  ' }),
      ).not.toThrow();
      expect(() => buildCharacterSheetPlan(kind, { subject: undefined, sourceRef: '' })).not.toThrow();
    }
  });

  it('每格提示词不含 undefined / null 之类占位串', () => {
    const plan = buildCharacterSheetPlan('full', { subject: SUBJECT, sourceRef: REF });
    for (const cell of plan.cells) {
      expect(cell.imagePrompt).not.toContain('undefined');
      expect(cell.imagePromptZh).not.toContain('undefined');
      expect(cell.imagePrompt).not.toContain('null');
      expect(cell.role.trim()).not.toBe('');
    }
  });
});

describe('角色设定表：素材库角色档案映射', () => {
  const profile: CharacterProfile = {
    id: 'char-1',
    name: '林川',
    descriptionZh: '雨夜出场的调查记者',
    consistencyPrompt: '',
    referenceImageUrl: '/media/library/lin.png',
    bible: {
      appearance: '黑色长发、左眉尾有疤',
      identity: '调查记者',
      personality: '冷静、多疑',
    },
    creative: {
      costumeLabel: '深蓝风衣',
      styleKeywords: '赛璐璐平涂',
      appearanceDetails: { hairColor: '黑', eyeColor: '琥珀' },
    },
  };

  it('从既有 CharacterProfile / CharacterBible 映射为设定表输入', () => {
    const subject = characterSheetSubjectFromProfile(profile);
    expect(subject.characterId).toBe('char-1');
    expect(subject.name).toBe('林川');
    expect(subject.appearanceZh).toContain('黑色长发、左眉尾有疤');
    expect(subject.appearanceZh).toContain('发色 黑');
    expect(subject.outfitZh).toBe('深蓝风衣');
    expect(subject.styleZh).toBe('赛璐璐平涂');
    expect(subject.occupationZh).toBe('调查记者');
    expect(subject.personalityZh).toBe('冷静、多疑');
    expect(subject.referenceImageUrl).toBe('/media/library/lin.png');
    expect(subject.bible).toBe(profile.bible);
  });

  it('映射结果直接用于构造计划时，锁定短语带出角色设定且不产生告警', () => {
    const subject = characterSheetSubjectFromProfile(profile);
    const plan = buildCharacterSheetPlan('turnaround', { subject });
    expect(plan.sourceRef).toBe('/media/library/lin.png');
    expect(plan.warningsZh).toEqual([]);
    expect(plan.cells[0]!.imagePrompt).toContain('林川');
    expect(plan.cells[0]!.imagePromptZh).toContain('深蓝风衣');
  });

  it('角色档案缺参考图时，按纯文字设定表给告警', () => {
    const bare: CharacterProfile = { id: 'c2', name: '无名' };
    const subject = characterSheetSubjectFromProfile(bare);
    expect(subject.referenceImageUrl).toBe('');
    const plan = buildCharacterSheetPlan('turnaround', { subject });
    expect(plan.sourceRef).toBe('');
    expect(plan.warningsZh.join('\n')).toContain('未提供参考图');
  });
});
