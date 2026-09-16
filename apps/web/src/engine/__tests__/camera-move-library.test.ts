/**
 * 大师运镜库回归（增量新增能力）。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：packages/shared/src/index.ts 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖运镜库与既有 prompt-presets，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_MOVE_FAMILY_LABELS,
  CAMERA_MOVE_FAMILY_ORDER,
  CAMERA_MOVE_LIBRARY,
  CAMERA_MOVE_PROMPT_PREFIX_EN,
  CAMERA_MOVE_PROMPT_PREFIX_ZH,
  DIRECTOR_CAMERA_MOVE_TO_MOVE,
  LEGACY_CAMERA_PRESET_TO_MOVE,
  buildCameraMovePrompt,
  cameraMoveFromDirectorMoveId,
  cameraMoveFromLegacyPresetId,
  cameraMovePromptPresets,
  cameraMoveToPromptPreset,
  cameraMovesByFamily,
  lookupCameraMove,
  searchCameraMoves,
  withCameraMovePrompt,
} from '../../../../../packages/shared/src/data/camera-move-library';
import { CAMERA_PROMPT_PRESETS } from '../../../../../packages/shared/src/data/prompt-presets';

const CJK = /[\u4e00-\u9fa5]/;
const PLACEHOLDER = /^(todo|tbd|placeholder|xxx|lorem|n\/a)$/i;

describe('CAMERA_MOVE_LIBRARY 词库本身', () => {
  it('条数 ≥ 40，id 唯一', () => {
    expect(CAMERA_MOVE_LIBRARY.length).toBeGreaterThanOrEqual(40);
    const ids = CAMERA_MOVE_LIBRARY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('family 全部合法，且 12 个家族都有条目', () => {
    for (const def of CAMERA_MOVE_LIBRARY) {
      expect(CAMERA_MOVE_FAMILY_ORDER, def.id).toContain(def.family);
    }
    for (const family of CAMERA_MOVE_FAMILY_ORDER) {
      expect(cameraMovesByFamily(family).length, family).toBeGreaterThan(0);
      expect(CAMERA_MOVE_FAMILY_LABELS[family], family).toBeTruthy();
    }
    expect(CAMERA_MOVE_FAMILY_ORDER).toHaveLength(12);
  });

  it('每条都有中文名/英文名/中文说明，且中英提示词齐备非占位', () => {
    for (const def of CAMERA_MOVE_LIBRARY) {
      expect(def.labelZh.trim(), def.id).toBeTruthy();
      expect(CJK.test(def.labelZh), def.id).toBe(true);
      expect(def.labelEn.trim(), def.id).toBeTruthy();
      expect(CJK.test(def.labelEn), def.id).toBe(false);
      expect(def.descZh.trim(), def.id).toBeTruthy();
      expect(def.descZh.length, def.id).toBeGreaterThanOrEqual(8);
      expect(def.promptZh.trim(), def.id).toBeTruthy();
      expect(CJK.test(def.promptZh), def.id).toBe(true);
      expect(def.promptEn.trim(), def.id).toBeTruthy();
      expect(CJK.test(def.promptEn), def.id).toBe(false);
      expect(PLACEHOLDER.test(def.promptEn.trim()), def.id).toBe(false);
      expect(PLACEHOLDER.test(def.promptZh.trim()), def.id).toBe(false);
    }
  });

  it('中英提示词各自不重复（防复制粘贴填充）', () => {
    const en = CAMERA_MOVE_LIBRARY.map((m) => m.promptEn.trim().toLowerCase());
    const zh = CAMERA_MOVE_LIBRARY.map((m) => m.promptZh.trim());
    expect(new Set(en).size).toBe(en.length);
    expect(new Set(zh).size).toBe(zh.length);
  });

  it('景别只用 NX9 既有词表，时长区间自洽', () => {
    const allowed = new Set(['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS']);
    for (const def of CAMERA_MOVE_LIBRARY) {
      for (const size of def.shotSizes ?? []) {
        expect(allowed.has(size), `${def.id}/${size}`).toBe(true);
      }
      if (def.durationHintSec) {
        const [min, max] = def.durationHintSec;
        expect(min, def.id).toBeGreaterThan(0);
        expect(max, def.id).toBeGreaterThanOrEqual(min);
        expect(def.durationHintSec).toHaveLength(2);
      }
      if (def.difficulty) {
        expect(['basic', 'advanced', 'pro'], def.id).toContain(def.difficulty);
      }
    }
  });

  it('覆盖需求点名的关键运镜（希区柯克变焦 / 甩镜 / 视差 / 环绕 / 航拍拉远 / 跟焦）', () => {
    const ids = CAMERA_MOVE_LIBRARY.map((m) => m.id);
    for (const id of [
      'dolly-zoom',
      'whip-pan',
      'whip-tilt',
      'parallax-slide',
      'orbit-360',
      'crane-reveal',
      'drone-pullback',
      'rack-focus',
      'fpv-flythrough',
      'static-locked-off',
    ]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe('lookupCameraMove / cameraMovesByFamily / searchCameraMoves', () => {
  it('按 id 命中（忽略空白与大小写），未命中返回 undefined', () => {
    expect(lookupCameraMove('push-slow')?.labelZh).toBe('缓推');
    expect(lookupCameraMove('  PUSH-SLOW ')?.id).toBe('push-slow');
    expect(lookupCameraMove('不存在的运镜')).toBeUndefined();
    expect(lookupCameraMove('')).toBeUndefined();
    expect(lookupCameraMove(undefined)).toBeUndefined();
    expect(lookupCameraMove(null)).toBeUndefined();
  });

  it('也接受中/英文名精确匹配', () => {
    expect(lookupCameraMove('缓推')?.id).toBe('push-slow');
    expect(lookupCameraMove('Slow Push-In')?.id).toBe('push-slow');
  });

  it('cameraMovesByFamily 保持词库顺序，非法家族返回空数组', () => {
    const push = cameraMovesByFamily('push');
    expect(push.length).toBeGreaterThanOrEqual(4);
    expect(push.every((m) => m.family === 'push')).toBe(true);
    const expected = CAMERA_MOVE_LIBRARY.filter((m) => m.family === 'push').map((m) => m.id);
    expect(push.map((m) => m.id)).toEqual(expected);
    expect(cameraMovesByFamily('nope')).toEqual([]);
  });

  it('searchCameraMoves 支持中文名/英文名/标签/提示词，空查询返回全库', () => {
    expect(searchCameraMoves('').length).toBe(CAMERA_MOVE_LIBRARY.length);
    expect(searchCameraMoves('缓推').some((m) => m.id === 'push-slow')).toBe(true);
    expect(searchCameraMoves('whip').map((m) => m.id)).toContain('whip-pan');
    expect(searchCameraMoves('希区柯克').some((m) => m.id === 'dolly-zoom')).toBe(true);
    expect(searchCameraMoves('眩晕').some((m) => m.id === 'dolly-zoom')).toBe(true);
    expect(searchCameraMoves('绝对不存在的关键词')).toEqual([]);
  });
});

describe('buildCameraMovePrompt', () => {
  it('按传入顺序拼装、去重（保留首次出现位置）', () => {
    const out = buildCameraMovePrompt(['orbit-180', 'push-slow', 'orbit-180']);
    expect(out).toBe(
      `${lookupCameraMove('orbit-180')!.promptEn}, ${lookupCameraMove('push-slow')!.promptEn}`,
    );
  });

  it('未知 id 默认跳过；onUnknown=throw 时抛错', () => {
    expect(buildCameraMovePrompt(['push-slow', 'nope'])).toBe(lookupCameraMove('push-slow')!.promptEn);
    expect(() => buildCameraMovePrompt(['nope'], { onUnknown: 'throw' })).toThrow();
  });

  it('空输入返回空串；接受单个字符串', () => {
    expect(buildCameraMovePrompt([])).toBe('');
    expect(buildCameraMovePrompt(null)).toBe('');
    expect(buildCameraMovePrompt(undefined)).toBe('');
    expect(buildCameraMovePrompt(['', '   '])).toBe('');
    expect(buildCameraMovePrompt('dolly-zoom')).toBe(lookupCameraMove('dolly-zoom')!.promptEn);
  });

  it('lang=zh 用中文片段与中文分隔符；lang=both 中英并排', () => {
    expect(buildCameraMovePrompt(['push-slow'], { lang: 'zh' })).toBe(
      lookupCameraMove('push-slow')!.promptZh,
    );
    expect(buildCameraMovePrompt(['push-slow', 'whip-pan'], { lang: 'zh' })).toBe(
      `${lookupCameraMove('push-slow')!.promptZh}、${lookupCameraMove('whip-pan')!.promptZh}`,
    );
    const both = buildCameraMovePrompt(['push-slow'], { lang: 'both' });
    expect(both).toContain(lookupCameraMove('push-slow')!.promptEn);
    expect(both).toContain(lookupCameraMove('push-slow')!.promptZh);
  });

  it('支持自定义分隔符', () => {
    expect(buildCameraMovePrompt(['push-slow', 'whip-pan'], { separator: ' + ' })).toBe(
      `${lookupCameraMove('push-slow')!.promptEn} + ${lookupCameraMove('whip-pan')!.promptEn}`,
    );
  });
});

describe('withCameraMovePrompt 注入既有提示词', () => {
  it('追加为独立一行，保留原文', () => {
    const out = withCameraMovePrompt('夜色街头，人物撑伞前行', ['push-slow']);
    expect(out.split('\n')[0]).toBe('夜色街头，人物撑伞前行');
    expect(out).toContain(`${CAMERA_MOVE_PROMPT_PREFIX_EN} `);
    expect(out).toContain(lookupCameraMove('push-slow')!.promptEn);
  });

  it('重复调用幂等（不堆叠运镜行）', () => {
    const once = withCameraMovePrompt('A', ['push-slow', 'whip-pan']);
    const twice = withCameraMovePrompt(once, ['push-slow', 'whip-pan']);
    expect(twice).toBe(once);
    expect(twice.split('\n').filter((l) => l.startsWith(CAMERA_MOVE_PROMPT_PREFIX_EN))).toHaveLength(1);
  });

  it('换选后替换既有运镜行，不产生第二行', () => {
    const first = withCameraMovePrompt('A', ['push-slow']);
    const second = withCameraMovePrompt(first, ['orbit-360']);
    expect(second.split('\n').filter((l) => l.startsWith(CAMERA_MOVE_PROMPT_PREFIX_EN))).toHaveLength(1);
    expect(second).toContain(lookupCameraMove('orbit-360')!.promptEn);
    expect(second).not.toContain(lookupCameraMove('push-slow')!.promptEn);
    expect(second.split('\n')[0]).toBe('A');
  });

  it('ids 为空时移除已注入的运镜行', () => {
    const injected = withCameraMovePrompt('A\n\nB', ['push-slow']);
    const cleared = withCameraMovePrompt(injected, []);
    expect(cleared).toBe('A\n\nB');
  });

  it('中文模式用「运镜：」前缀并可与英文行互相替换', () => {
    const zh = withCameraMovePrompt('原文', ['push-slow'], { lang: 'zh' });
    expect(zh).toContain(`${CAMERA_MOVE_PROMPT_PREFIX_ZH}${lookupCameraMove('push-slow')!.promptZh}`);
    const en = withCameraMovePrompt(zh, ['push-slow'], { lang: 'en' });
    expect(en.split('\n').filter((l) => l.includes('运镜：'))).toHaveLength(0);
    expect(en.split('\n').filter((l) => l.startsWith(CAMERA_MOVE_PROMPT_PREFIX_EN))).toHaveLength(1);
  });

  it('原文为空时只产出运镜行；不修改传入字符串', () => {
    expect(withCameraMovePrompt('', ['whip-pan'])).toBe(
      `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${lookupCameraMove('whip-pan')!.promptEn}`,
    );
    const src = 'A\nB';
    withCameraMovePrompt(src, ['whip-pan']);
    expect(src).toBe('A\nB');
  });
});

describe('兼容适配器（不替换既有数组）', () => {
  it('cameraMoveToPromptPreset 产出既有 PromptPreset 形状', () => {
    const def = lookupCameraMove('orbit-180')!;
    const preset = cameraMoveToPromptPreset(def);
    expect(preset).toEqual({
      id: 'orbit-180',
      label: def.labelZh,
      text: def.promptEn,
      group: CAMERA_MOVE_FAMILY_LABELS.orbit,
    });
    expect(Object.keys(preset).sort()).toEqual(['group', 'id', 'label', 'text']);
  });

  it('cameraMovePromptPresets 默认整库，并可按子集裁剪', () => {
    expect(cameraMovePromptPresets()).toHaveLength(CAMERA_MOVE_LIBRARY.length);
    expect(cameraMovePromptPresets(cameraMovesByFamily('aerial')).every((p) => p.group === '航拍')).toBe(true);
  });

  it('既有 CAMERA_PROMPT_PRESETS 未被改动，且与词库 id 不冲突（纯增量）', () => {
    expect(CAMERA_PROMPT_PRESETS).toHaveLength(8);
    const legacyIds = CAMERA_PROMPT_PRESETS.map((p) => p.id);
    expect(legacyIds).toEqual([
      'cam-dolly-in',
      'cam-dolly-out',
      'cam-orbit',
      'cam-crane-up',
      'cam-tracking',
      'cam-whip-pan',
      'cam-fpv',
      'cam-static',
    ]);
    const libraryIds = new Set(CAMERA_MOVE_LIBRARY.map((m) => m.id));
    for (const id of legacyIds) expect(libraryIds.has(id), id).toBe(false);
  });

  it('既有 8 条预设都能映射到词库条目，未知名返回 undefined', () => {
    expect(Object.keys(LEGACY_CAMERA_PRESET_TO_MOVE)).toHaveLength(CAMERA_PROMPT_PRESETS.length);
    for (const preset of CAMERA_PROMPT_PRESETS) {
      const def = cameraMoveFromLegacyPresetId(preset.id);
      expect(def, preset.id).toBeTruthy();
      expect(def!.id).toBe(LEGACY_CAMERA_PRESET_TO_MOVE[preset.id]);
    }
    expect(cameraMoveFromLegacyPresetId('cam-nope')).toBeUndefined();
    expect(cameraMoveFromLegacyPresetId(undefined)).toBeUndefined();
  });

  it('3D 导演台 15 个 CameraMoveId 都能映射到词库条目', () => {
    // 与 packages/director3d/src/schema/cameraGeometry.ts 的 CameraMoveId 联合保持一致
    const directorMoveIds = [
      'static',
      'dolly-in',
      'dolly-out',
      'truck-left',
      'truck-right',
      'pedestal-up',
      'pedestal-down',
      'pan-left',
      'pan-right',
      'tilt-up',
      'tilt-down',
      'orbit',
      'crane-up',
      'crane-down',
      'handheld',
    ];
    expect(Object.keys(DIRECTOR_CAMERA_MOVE_TO_MOVE).sort()).toEqual([...directorMoveIds].sort());
    for (const moveId of directorMoveIds) {
      const def = cameraMoveFromDirectorMoveId(moveId);
      expect(def, moveId).toBeTruthy();
      expect(def!.id).toBe(DIRECTOR_CAMERA_MOVE_TO_MOVE[moveId]);
    }
    expect(cameraMoveFromDirectorMoveId('nope')).toBeUndefined();
  });
});
