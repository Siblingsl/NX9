/**
 * 运镜提示词反向解析 + 两通道合流（增量新增能力）回归。
 *
 * 注意：本文件 import 走**相对路径直取源码**，而不是 '@nx9/shared'。
 * 原因：`packages/shared/src/index.ts` 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会解析失败；相对路径只依赖运镜库 / prompt-presets / 时间轴 / 解析 / 合流模块，
 * 与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_MOVE_PROMPT_PHRASES,
  PARSE_WARNING_PREFIX,
  VALIDATE_WARNING_PREFIX,
  extractMoveTimelineFromPrompt,
  findMovePhrases,
  parseCameraMovePrompt,
  parseComposedMovePrompt,
  resolveMovePhrase,
  splitComposedBoth,
  stripCameraMovePromptPrefix,
} from '../../../../../packages/shared/src/utils/camera-move-parse';
import {
  DIRECTOR3D_CAMERA_MOVE_PHRASES,
  findDirector3dMovePhrases,
  mergeCameraMoveChannels,
  mergeShotCameraMoveChannels,
} from '../../../../../packages/shared/src/utils/camera-move-merge';
import {
  CAMERA_MOVE_LIBRARY,
  CAMERA_MOVE_PROMPT_PREFIX_EN,
  CAMERA_MOVE_PROMPT_PREFIX_ZH,
  buildCameraMovePrompt,
  lookupCameraMove,
  withCameraMovePrompt,
} from '../../../../../packages/shared/src/data/camera-move-library';
import {
  buildComposedMovePrompt,
  moveTimelineFromShotDuration,
  withMoveTimelinePrompt,
} from '../../../../../packages/shared/src/utils/camera-move-timeline';
import {
  CAMERA_MOVE_TIMELINE_VERSION,
  type CameraMoveSegment,
  type CameraMoveSpeedRamp,
  type CameraMoveTimeline,
} from '../../../../../packages/shared/src/types/camera-move-timeline';

/** 词库实体的短语（避免把提示词文案硬编码进测试） */
function def(id: string) {
  const d = lookupCameraMove(id);
  if (!d) throw new Error('测试前置失败：运镜词库缺少 ' + id);
  return d;
}

function tl(
  durationSec: number,
  segments: Array<Partial<CameraMoveSegment> & { moveId: string; startT: number; endT: number }>,
  beatAligned?: boolean,
): CameraMoveTimeline {
  return {
    version: CAMERA_MOVE_TIMELINE_VERSION,
    durationSec,
    segments: segments.map((s, i) => ({ id: `seg-${i + 1}`, ...s })),
    ...(beatAligned === undefined ? {} : { beatAligned }),
  };
}

/** 时间与幅度在提示词里只保留 2 位小数，故往返容差为 ±0.005 */
function expectTimelineEquivalent(parsed: CameraMoveTimeline, expected: CameraMoveTimeline) {
  expect(parsed.segments.length).toBe(expected.segments.length);
  expect(parsed.durationSec).toBeCloseTo(expected.durationSec, 2);
  expect(Boolean(parsed.beatAligned)).toBe(Boolean(expected.beatAligned));
  expected.segments.forEach((want, i) => {
    const got = parsed.segments[i];
    expect(got, `第 ${i + 1} 段缺失`).toBeTruthy();
    expect(got.moveId).toBe(want.moveId);
    expect(got.startT).toBeCloseTo(want.startT, 2);
    expect(got.endT).toBeCloseTo(want.endT, 2);
    expect(got.amplitude ?? 1).toBeCloseTo(want.amplitude ?? 1, 2);
    expect(got.speedRamp ?? 'steady').toBe(want.speedRamp ?? 'steady');
  });
}

/** 解析级告警（排除「校验：」前缀的校验提示） */
function parseWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => w.startsWith(PARSE_WARNING_PREFIX));
}

describe('运镜词库与正向格式的不变量（解析器的前提）', () => {
  it('提示词短语互不为子串（最长匹配因此无歧义）', () => {
    const phrases = CAMERA_MOVE_PROMPT_PHRASES.map((p) => p.phrase.trim().toLowerCase());
    const offenders: string[] = [];
    for (const a of phrases) {
      for (const b of phrases) {
        if (a === b) continue;
        if (a.includes(b)) offenders.push(`「${b}」是「${a}」的子串`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('提示词短语不含解析保留字符（→ × – — 、 /）', () => {
    const offenders = CAMERA_MOVE_PROMPT_PHRASES.filter((p) =>
      /[→×–—、/]/.test(p.phrase),
    ).map((p) => `${p.key}: ${p.phrase}`);
    expect(offenders).toEqual([]);
  });

  it('提示词短语不以幅度 / 速度曲线后缀结尾（否则剥离会吃掉正文）', () => {
    const offenders: string[] = [];
    for (const p of CAMERA_MOVE_PROMPT_PHRASES) {
      if (/\s+at\s+[\d.]+\s*x\s+amplitude$/i.test(p.phrase)) offenders.push(`${p.key}:${p.phrase}`);
      if (/\s+gradually\s+(accelerating|decelerating)$/i.test(p.phrase)) offenders.push(`${p.key}:${p.phrase}`);
      if (/幅度\s*[\d.]+\s*[×x]$/.test(p.phrase)) offenders.push(`${p.key}:${p.phrase}`);
      if (/(逐渐加速|逐渐减速)$/.test(p.phrase)) offenders.push(`${p.key}:${p.phrase}`);
    }
    expect(offenders).toEqual([]);
  });

  it('运镜 id 唯一', () => {
    const ids = CAMERA_MOVE_LIBRARY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('往返一致性：parseComposedMovePrompt(buildComposedMovePrompt(tl))', () => {
  it('单段 · 英文 · 带时间', () => {
    const input = tl(6, [{ moveId: 'push-slow', startT: 0, endT: 6 }]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    const parsed = parseComposedMovePrompt(composed.en);
    expect(parsed).not.toBeNull();
    expectTimelineEquivalent(parsed!.timeline, input);
    expect(parsed!.lang).toBe('en');
    expect(parsed!.hadTiming).toBe(true);
    expect(parsed!.hadTotal).toBe(true);
  });

  it('单段 · 中文 · 带时间', () => {
    const input = tl(6, [{ moveId: 'push-slow', startT: 0, endT: 6 }]);
    const composed = buildComposedMovePrompt(input, { lang: 'zh' });
    const parsed = parseComposedMovePrompt(composed.zh);
    expect(parsed).not.toBeNull();
    expectTimelineEquivalent(parsed!.timeline, input);
    expect(parsed!.lang).toBe('zh');
  });

  it('多段 · 中英 · 含幅度与速度曲线（中文后缀顺序 幅度→逐渐加速）', () => {
    const input = tl(8, [
      { moveId: 'push-slow', startT: 0, endT: 3, amplitude: 1.2, speedRamp: 'accelerate' },
      { moveId: 'orbit-180', startT: 3, endT: 6, amplitude: 0.8, speedRamp: 'decelerate' },
      { moveId: 'static-locked-off', startT: 6, endT: 8 },
    ]);
    for (const lang of ['en', 'zh'] as const) {
      const composed = buildComposedMovePrompt(input, { lang });
      const text = lang === 'en' ? composed.en : composed.zh;
      const parsed = parseComposedMovePrompt(text);
      expect(parsed, lang).not.toBeNull();
      expectTimelineEquivalent(parsed!.timeline, input);
      expect(parsed!.parts.length).toBe(3);
      expect(parseWarnings(parsed!.warnings)).toEqual([]);
    }
  });

  it('幅度恰为 1 时不写进提示词，解析回落 1（往返仍一致）', () => {
    const input = tl(4, [
      { moveId: 'zoom-in', startT: 0, endT: 2, amplitude: 1 },
      { moveId: 'zoom-out', startT: 2, endT: 4, amplitude: 1 },
    ]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    expect(composed.en).not.toContain('amplitude');
    const parsed = parseComposedMovePrompt(composed.en);
    expectTimelineEquivalent(parsed!.timeline, input);
  });

  it('短语以数字开头的运镜（orbit-180 / orbit-360）不会被时间正则误吞', () => {
    const input = tl(6, [
      { moveId: 'orbit-180', startT: 0, endT: 3 },
      { moveId: 'orbit-360', startT: 3, endT: 6 },
    ]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    expect(composed.en.startsWith('0-3s 180-degree')).toBe(true);
    const parsed = parseComposedMovePrompt(composed.en);
    expect(parsed!.parts.map((p) => p.moveId)).toEqual(['orbit-180', 'orbit-360']);
    expectTimelineEquivalent(parsed!.timeline, input);
  });

  it('节拍对齐标记往返', () => {
    const input = tl(8, [{ moveId: 'whip-pan', startT: 0, endT: 8 }], true);
    for (const lang of ['en', 'zh'] as const) {
      const composed = buildComposedMovePrompt(input, { lang });
      const parsed = parseComposedMovePrompt(lang === 'en' ? composed.en : composed.zh);
      expect(parsed!.timeline.beatAligned, lang).toBe(true);
      expectTimelineEquivalent(parsed!.timeline, input);
    }
  });

  it('总时长后缀被保留（末段未覆盖到总时长时也能还原 durationSec）', () => {
    const input = tl(10, [{ moveId: 'tilt-up', startT: 0, endT: 4 }]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    const parsed = parseComposedMovePrompt(composed.en);
    expect(parsed!.timeline.durationSec).toBeCloseTo(10, 2);
    expect(parsed!.timeline.segments[0].endT).toBeCloseTo(4, 2);
    // 尾巴 6s 静止属于真实提示词信息，应以校验提示暴露而不是被静默补段
    expect(parsed!.warnings.some((w) => w.startsWith(VALIDATE_WARNING_PREFIX) && w.includes('没有运镜'))).toBe(true);
  });

  it('两位小数之外的精度按 ±0.005 容差还原（formatMoveSeconds 的固有精度）', () => {
    const input = tl(6.6667, [
      { moveId: 'pan-slow', startT: 0, endT: 3.3333 },
      { moveId: 'pan-fast', startT: 3.3333, endT: 6.6667 },
    ]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    const parsed = parseComposedMovePrompt(composed.en)!;
    expectTimelineEquivalent(parsed.timeline, input);
  });

  it('includeTiming:false 时不臆造时间：parts 保留 id/顺序/幅度，timeline 为空并有明确告警', () => {
    const input = tl(6, [
      { moveId: 'push-slow', startT: 0, endT: 3, amplitude: 1.5, speedRamp: 'accelerate' },
      { moveId: 'pull-slow', startT: 3, endT: 6 },
    ]);
    const composed = buildComposedMovePrompt(input, { lang: 'en', includeTiming: false });
    const parsed = parseComposedMovePrompt(composed.en)!;
    expect(parsed.hadTiming).toBe(false);
    expect(parsed.hadTotal).toBe(false);
    expect(parsed.timeline.segments).toEqual([]);
    expect(parsed.timeline.durationSec).toBe(0);
    expect(parsed.parts.map((p) => p.moveId)).toEqual(['push-slow', 'pull-slow']);
    expect(parsed.parts[0].amplitude).toBeCloseTo(1.5, 2);
    expect(parsed.parts[0].speedRamp).toBe('accelerate');
    expect(parseWarnings(parsed.warnings).some((w) => w.includes('未包含时间区间'))).toBe(true);
  });

  it('带前缀的完整注入行（withMoveTimelinePrompt）也能直接解析', () => {
    const input = tl(6, [
      { moveId: 'push-fast', startT: 0, endT: 2, speedRamp: 'accelerate' },
      { moveId: 'static-tableau', startT: 2, endT: 6 },
    ]);
    for (const lang of ['en', 'zh'] as const) {
      const text = withMoveTimelinePrompt(
        '主角推门而入\n镜头跟随主角移动到窗前',
        input,
        { lang },
      );
      expect(text.split('\n')[0]).toBe('主角推门而入');
      const parsed = parseComposedMovePrompt(text);
      expect(parsed, lang).not.toBeNull();
      expectTimelineEquivalent(parsed!.timeline, input);
    }
  });

  it('lang:both 注入行的中英两段均可还原且互为印证', () => {
    const input = tl(6, [
      { moveId: 'push-slow', startT: 0, endT: 3 },
      { moveId: 'orbit-90', startT: 3, endT: 6, amplitude: 1.4 },
    ]);
    const composed = buildComposedMovePrompt(input, { lang: 'both' });
    expect(splitComposedBoth(composed.text)).not.toBeNull();
    const parsed = parseComposedMovePrompt(composed.text);
    expect(parsed!.lang).toBe('both');
    expect(parsed!.parts.map((p) => p.moveId)).toEqual(['push-slow', 'orbit-90']);
    expectTimelineEquivalent(parsed!.timeline, input);
  });

  it('未知 moveId 不丢信息：短语回落为 id 原文，并给出明确告警', () => {
    const input = tl(4, [{ moveId: 'nx9-custom-move', startT: 0, endT: 4 }]);
    const composed = buildComposedMovePrompt(input, { lang: 'en' });
    const parsed = parseComposedMovePrompt(composed.en)!;
    expect(parsed.hasUnresolved).toBe(true);
    expect(parsed.timeline.segments[0].moveId).toBe('nx9-custom-move');
    expect(parsed.timeline.segments[0].startT).toBe(0);
    expect(parsed.timeline.segments[0].endT).toBe(4);
    expect(parseWarnings(parsed.warnings).some((w) => w.includes('未能把短语对应到运镜词库'))).toBe(true);
  });
});

describe('parseComposedMovePrompt · 往返压力（随机时间轴 · 固定种子可复现）', () => {
  const MOVE_IDS = CAMERA_MOVE_LIBRARY.map((d) => d.id);
  const RAMPS: CameraMoveSpeedRamp[] = ['steady', 'accelerate', 'decelerate'];

  /** 线性同余伪随机：固定种子 ⇒ 失败可复现 */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  function randomTimeline(rnd: () => number): CameraMoveTimeline {
    const count = 1 + Math.floor(rnd() * 4);
    const segments: CameraMoveSegment[] = [];
    const used = new Set<string>();
    let cursor = 0;
    for (let i = 0; i < count; i += 1) {
      let moveId = MOVE_IDS[Math.floor(rnd() * MOVE_IDS.length)];
      // 同一时间轴内避免重复运镜，保证「段数 = 提示词片段数」可核对
      let guard = 0;
      while (used.has(moveId) && guard < 8) {
        moveId = MOVE_IDS[Math.floor(rnd() * MOVE_IDS.length)];
        guard += 1;
      }
      used.add(moveId);
      const dur = (50 + Math.floor(rnd() * 300)) / 100; // 0.50 ~ 3.49s，两位小数
      const startT = Math.round(cursor * 100) / 100;
      const endT = Math.round((cursor + dur) * 100) / 100;
      segments.push({
        id: `seg-${i + 1}`,
        moveId,
        startT,
        endT,
        amplitude: (20 + Math.floor(rnd() * 36)) / 20, // 1.00 ~ 2.75，0.05 步进
        easing: 'linear',
        speedRamp: RAMPS[Math.floor(rnd() * RAMPS.length)],
      });
      cursor = endT;
    }
    return {
      version: CAMERA_MOVE_TIMELINE_VERSION,
      durationSec: Math.round(cursor * 100) / 100,
      segments,
      beatAligned: rnd() < 0.5,
    };
  }

  it('200 组随机时间轴 × 中/英 × 带前缀/不带前缀 ⇒ 全部往返一致', () => {
    const rnd = lcg(0x9e3779b9);
    const failures: string[] = [];
    let cases = 0;
    for (let n = 0; n < 200; n += 1) {
      const input = randomTimeline(rnd);
      for (const lang of ['en', 'zh'] as const) {
        const composed = buildComposedMovePrompt(input, { lang });
        const plain = lang === 'en' ? composed.en : composed.zh;
        const injected = withMoveTimelinePrompt('一段无关的前置描述', input, { lang });
        for (const text of [plain, injected]) {
          cases += 1;
          const parsed = parseComposedMovePrompt(text);
          try {
            expect(parsed).not.toBeNull();
            expectTimelineEquivalent(parsed!.timeline, input);
            const unresolved = parsed!.parts.filter((p) => !p.resolved);
            expect(unresolved.map((p) => p.phrase)).toEqual([]);
          } catch (error) {
            failures.push(`seed-case #${n} lang=${lang} injected=${text === injected} tl=${JSON.stringify(input)} :: ${String(error)}`);
          }
        }
      }
    }
    expect(cases).toBe(800);
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it('随机时间轴在 includeTiming:false 下：id/顺序/幅度/速度曲线仍全部还原', () => {
    const rnd = lcg(0x2545f491);
    const failures: string[] = [];
    for (let n = 0; n < 60; n += 1) {
      const input = randomTimeline(rnd);
      for (const lang of ['en', 'zh'] as const) {
        const composed = buildComposedMovePrompt(input, { lang, includeTiming: false });
        const parsed = parseComposedMovePrompt(lang === 'en' ? composed.en : composed.zh);
        try {
          expect(parsed!.hadTiming).toBe(false);
          expect(parsed!.parts.map((p) => p.moveId)).toEqual(input.segments.map((s) => s.moveId));
          parsed!.parts.forEach((p, i) => {
            expect(p.amplitude).toBeCloseTo(input.segments[i].amplitude ?? 1, 2);
            expect(p.speedRamp).toBe(input.segments[i].speedRamp ?? 'steady');
          });
        } catch (error) {
          failures.push(`#${n} lang=${lang} tl=${JSON.stringify(input)} :: ${String(error)}`);
        }
      }
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it('moveTimelineFromShotDuration 铺开后的时间轴同样往返一致', () => {
    const laid = moveTimelineFromShotDuration(9, ['push-slow', 'pan-follow', 'orbit-90', 'static-locked-off']);
    const composed = buildComposedMovePrompt(laid, { lang: 'en' });
    const parsed = parseComposedMovePrompt(composed.en);
    expect(parsed).not.toBeNull();
    expectTimelineEquivalent(parsed!.timeline, laid);
  });
});

describe('parseCameraMovePrompt：camera movement: / 运镜：前缀文本', () => {
  it('英文单运镜（withCameraMovePrompt 产物）', () => {
    const text = withCameraMovePrompt('主体推门而入', ['push-slow'], { lang: 'en' });
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(['push-slow']);
    expect(parseWarnings(parsed.warnings)).toEqual([]);
  });

  it('中文多运镜（、分隔）', () => {
    const text = withCameraMovePrompt(null, ['push-slow', 'whip-pan'], { lang: 'zh' });
    expect(text.startsWith(CAMERA_MOVE_PROMPT_PREFIX_ZH)).toBe(true);
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(['push-slow', 'whip-pan']);
    expect(parseWarnings(parsed.warnings)).toEqual([]);
  });

  it('英文多运镜：短语自带逗号也不会被误切（词库短语扫描的核心理由）', () => {
    const ids = ['static-locked-off', 'push-slow', 'orbit-180'];
    const text = `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${buildCameraMovePrompt(ids, { lang: 'en' })}`;
    // 提示词里确实含有大量逗号（短语内部），按逗号切分必然切错
    expect(text.split(',').length).toBeGreaterThan(ids.length);
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(ids);
  });

  it('中英并排（lang: both）也能去重还原', () => {
    const ids = ['push-slow', 'crane-up'];
    const text = `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${buildCameraMovePrompt(ids, { lang: 'both' })}`;
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(ids);
  });

  it('无前缀自由文本仍扫描，但要明确告知缺前缀', () => {
    const text = def('tilt-up').promptZh;
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(['tilt-up']);
    expect(parseWarnings(parsed.warnings).some((w) => w.includes('没有'))).toBe(true);
  });

  it('词库外文本：不猜、不抛，给出未识别告警', () => {
    const parsed = parseCameraMovePrompt(`${CAMERA_MOVE_PROMPT_PREFIX_EN} some custom camera drift`);
    expect(parsed.moveIds).toEqual([]);
    expect(parseWarnings(parsed.warnings).some((w) => w.includes('未识别到'))).toBe(true);
  });

  it('多条运镜行时告警提示（正常注入只会有一条）', () => {
    const text = [
      `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${def('push-slow').promptEn}`,
      `${CAMERA_MOVE_PROMPT_PREFIX_ZH}${def('orbit-90').promptZh}`,
    ].join('\n');
    const parsed = parseCameraMovePrompt(text);
    expect(parsed.moveIds).toEqual(['push-slow', 'orbit-90']);
    expect(parseWarnings(parsed.warnings).some((w) => w.includes('2 条运镜行'))).toBe(true);
  });

  it('findMovePhrases 只认提示词短语，不误报 id / 可读名', () => {
    expect(findMovePhrases('an orbit around the subject happens')).toEqual([]);
    expect(findMovePhrases('call push-slow now')).toEqual([]);
    expect(findMovePhrases(def('orbit-180').promptEn).map((h) => h.moveId)).toEqual(['orbit-180']);
  });

  it('resolveMovePhrase：精确 / id 名 / 截断模糊 / 未命中四种口径', () => {
    expect(resolveMovePhrase(def('push-slow').promptEn).via).toBe('prompt-phrase');
    expect(resolveMovePhrase('缓推').moveId).toBe('push-slow');
    expect(resolveMovePhrase('push-slow').moveId).toBe('push-slow');
    const truncated = def('push-slow').promptEn.split(',')[0];
    const fuzzy = resolveMovePhrase(truncated);
    expect(fuzzy.moveId).toBe('push-slow');
    expect(fuzzy.via).toBe('fuzzy');
    const unknown = resolveMovePhrase('完全不存在的一段运镜描述');
    expect(unknown.resolved).toBe(false);
    expect(unknown.moveId).toBe('完全不存在的一段运镜描述');
  });

  it('stripCameraMovePromptPrefix：中英前缀识别与无前缀原样返回', () => {
    expect(stripCameraMovePromptPrefix(`${CAMERA_MOVE_PROMPT_PREFIX_EN} abc`)).toEqual({
      rest: 'abc',
      hadPrefix: true,
      lang: 'en',
    });
    expect(stripCameraMovePromptPrefix(`${CAMERA_MOVE_PROMPT_PREFIX_ZH}abc`)).toEqual({
      rest: 'abc',
      hadPrefix: true,
      lang: 'zh',
    });
    expect(stripCameraMovePromptPrefix('abc')).toEqual({ rest: 'abc', hadPrefix: false, lang: 'unknown' });
    expect(stripCameraMovePromptPrefix('')).toEqual({ rest: '', hadPrefix: false, lang: 'unknown' });
  });
});

describe('非法 / 畸形输入：一律不抛异常', () => {
  const BAD_INPUTS: unknown[] = [
    null,
    undefined,
    '',
    '   ',
    '\n\n',
    '→ → →',
    '0-3s',
    '0-3s ',
    '(total 6s)',
    '（共 6 秒）',
    'camera movement:',
    '运镜：',
    'camera movement: →  → ',
    '0-3s (total 6s',
    '0-3s a (total abc)',
    '-3-6s something',
    '1.2.3-4.5.6s x',
    'NaN-NaN s',
    'camera movement: ' + 'x'.repeat(5000),
    '→'.repeat(1000),
    ' 幅度 1.2× 逐渐加速',
    '0–3 秒 逐渐加速 幅度 1.2×',
    {},
    [],
    123,
    true,
    Symbol('s'),
    () => 'nope',
  ];

  it('parseComposedMovePrompt 对畸形输入返回 null 或带告警的结果', () => {
    for (const input of BAD_INPUTS) {
      let result: unknown;
      expect(() => {
        result = parseComposedMovePrompt(input as string);
      }, `输入：${String(input)}`).not.toThrow();
      if (result !== null) {
        const parsed = result as { timeline: CameraMoveTimeline; warnings: string[] };
        expect(Array.isArray(parsed.warnings)).toBe(true);
        expect(Array.isArray(parsed.timeline.segments)).toBe(true);
        expect(Number.isFinite(parsed.timeline.durationSec)).toBe(true);
      }
    }
  });

  it('parseCameraMovePrompt 对畸形输入总是返回 { moveIds, warnings }', () => {
    for (const input of BAD_INPUTS) {
      let result: { moveIds: string[]; warnings: string[] } | null = null;
      expect(() => {
        result = parseCameraMovePrompt(input as string);
      }, `输入：${String(input)}`).not.toThrow();
      expect(Array.isArray(result!.moveIds)).toBe(true);
      expect(Array.isArray(result!.warnings)).toBe(true);
    }
  });

  it('extractMoveTimelineFromPrompt 对畸形输入不抛，且非运镜文本原样保留', () => {
    for (const input of BAD_INPUTS) {
      let result: { remainingText: string } | null = null;
      expect(() => {
        result = extractMoveTimelineFromPrompt(input as string);
      }, `输入：${String(input)}`).not.toThrow();
      expect(typeof result!.remainingText).toBe('string');
    }
    const passthrough = '第一行正文\n第二行正文';
    expect(extractMoveTimelineFromPrompt(passthrough).remainingText).toBe(passthrough);
    expect(extractMoveTimelineFromPrompt(passthrough).lines).toEqual([]);
  });

  it('损坏的运镜行不会被静默改写：无法识别时仍报告并保留原文', () => {
    const text = '正文 A\ncamera movement: 完全自定义的机位运动\n正文 B';
    const extracted = extractMoveTimelineFromPrompt(text);
    expect(extracted.lines.length).toBe(1);
    expect(extracted.lines[0].moveIds).toEqual([]);
    expect(extracted.lines[0].cameraText).toBe('完全自定义的机位运动');
    expect(extracted.remainingText).toBe('正文 A\n正文 B');
  });
});

describe('extractMoveTimelineFromPrompt：混合自由文本抽取', () => {
  const composed = buildComposedMovePrompt(
    tl(6, [
      { moveId: 'push-slow', startT: 0, endT: 3, speedRamp: 'accelerate' },
      { moveId: 'pan-follow', startT: 3, endT: 6 },
    ]),
    { lang: 'en' },
  );

  it('带前缀的运镜行被抽走，其余行逐字保留', () => {
    const text = ['主角推门而入，情绪由紧到松', `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${composed.en}`, '结尾停在窗外雨声'].join('\n');
    const extracted = extractMoveTimelineFromPrompt(text);
    expect(extracted.lines.length).toBe(1);
    expect(extracted.lines[0].hadPrefix).toBe(true);
    expect(extracted.moveIds).toEqual(['push-slow', 'pan-follow']);
    expect(extracted.remainingText).toBe('主角推门而入，情绪由紧到松\n结尾停在窗外雨声');
    expect(extracted.timeline).not.toBeNull();
    expect(extracted.timeline!.segments.length).toBe(2);
  });

  it('前缀出现在行中间时，前缀之前的正文也保留', () => {
    const text = `镜头说明。${CAMERA_MOVE_PROMPT_PREFIX_ZH}${def('push-slow').promptZh}`;
    const extracted = extractMoveTimelineFromPrompt(text);
    expect(extracted.lines.length).toBe(1);
    expect(extracted.lines[0].cameraStart).toBe('镜头说明。'.length);
    expect(extracted.remainingText).toBe('镜头说明。');
    expect(extracted.moveIds).toEqual(['push-slow']);
  });

  it('无前缀但带时间区间标记的行（裸时间轴）也能识别', () => {
    const text = `动作描述\n${composed.en}\n后续说明`;
    const extracted = extractMoveTimelineFromPrompt(text);
    expect(extracted.lines.length).toBe(1);
    expect(extracted.lines[0].hadPrefix).toBe(false);
    expect(extracted.lines[0].hadTiming).toBe(true);
    expect(extracted.remainingText).toBe('动作描述\n后续说明');
  });

  it('纯短语行（无前缀无时间）也能识别，且不会误伤正文行', () => {
    const pure = `${def('pan-slow').promptZh}、${def('orbit-90').promptZh}`;
    const extracted = extractMoveTimelineFromPrompt(`正文\n${pure}\n正文2`);
    expect(extracted.lines.length).toBe(1);
    expect(extracted.moveIds).toEqual(['pan-slow', 'orbit-90']);
    expect(extracted.remainingText).toBe('正文\n正文2');
    // 普通中文正文不会被当成运镜行
    expect(extractMoveTimelineFromPrompt('她缓慢推开门，镜头里只有雨').lines).toEqual([]);
  });

  it('多条带时间的运镜行不合并时间轴（不拼假时间轴）', () => {
    const other = buildComposedMovePrompt(tl(4, [{ moveId: 'whip-pan', startT: 0, endT: 4 }]), { lang: 'en' });
    const text = [`${CAMERA_MOVE_PROMPT_PREFIX_EN} ${composed.en}`, `${CAMERA_MOVE_PROMPT_PREFIX_EN} ${other.en}`].join('\n');
    const extracted = extractMoveTimelineFromPrompt(text);
    expect(extracted.lines.length).toBe(2);
    expect(extracted.timeline).toBeNull();
    expect(extracted.warnings.some((w) => w.includes('无法确认是否属于同一镜头'))).toBe(true);
  });

  it('抽取是只读的：输入文本对象不被修改（就地替换由调用方决定）', () => {
    const text = `正文\n${CAMERA_MOVE_PROMPT_PREFIX_EN} ${composed.en}`;
    const before = text;
    extractMoveTimelineFromPrompt(text);
    expect(text).toBe(before);
    // 用 remainingText + 新运镜行可以重建（「就地替换」的用法）
    const rebuilt = `${extractMoveTimelineFromPrompt(text).remainingText}\n${withMoveTimelinePrompt(null, tl(4, [{ moveId: 'zoom-in', startT: 0, endT: 4 }]), { lang: 'en' })}`;
    expect(parseCameraMovePrompt(rebuilt).moveIds).toEqual(['zoom-in']);
  });
});

describe('合流：videoPrompt × director3dGuide.cameraPrompt', () => {
  const videoPush = withCameraMovePrompt(null, ['push-slow'], { lang: 'en' });

  it('两通道一致（3D 机位短语映射回运镜库）⇒ 无冲突，source=both', () => {
    // 3D 基础机位短语：`camera movement: slow dolly in`（nx9/generic 皮肤）
    const result = mergeCameraMoveChannels({
      videoPrompt: videoPush,
      director3dCameraPrompt: 'medium shot, eye level, camera movement: slow dolly in',
    });
    expect(result.source).toBe('both');
    expect(result.video.moveIds).toEqual(['push-slow']);
    expect(result.director3d.moveIds).toEqual(['push-slow']);
    expect(result.director3d.vocab).toBe('director3d');
    expect(result.conflicts).toEqual([]);
    expect(result.summaryZh).toContain('两通道一致');
    expect(result.summaryEn).toContain('Both channels agree');
  });

  it('两通道运镜不同 ⇒ [运镜不一致] 显式报出，不静默覆盖', () => {
    const result = mergeCameraMoveChannels({
      videoPrompt: withCameraMovePrompt(null, ['push-slow'], { lang: 'en' }),
      director3dCameraPrompt: 'wide shot, camera movement: orbit around subject',
    });
    expect(result.source).toBe('both');
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]).toContain('[运镜不一致]');
    expect(result.conflicts[0]).toContain(def('push-slow').labelZh);
    expect(result.conflicts[0]).toContain(def('orbit-180').labelZh);
    expect(result.summaryZh).toContain('冲突');
  });

  it('集合相同但顺序不同 ⇒ [顺序不一致]', () => {
    const result = mergeCameraMoveChannels({
      videoPrompt: withCameraMovePrompt(null, ['push-slow', 'orbit-180'], { lang: 'en' }),
      director3dCameraPrompt: 'camera movement: orbits around the subject, then slow dolly in',
    });
    expect(result.video.moveIds).toEqual(['push-slow', 'orbit-180']);
    expect(result.director3d.moveIds).toEqual(['orbit-180', 'push-slow']);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]).toContain('[顺序不一致]');
  });

  it('只有镜表有运镜 ⇒ 不报冲突，摘要说明 3D 通道缺失', () => {
    const result = mergeCameraMoveChannels({ videoPrompt: videoPush, director3dCameraPrompt: null });
    expect(result.source).toBe('video');
    expect(result.conflicts).toEqual([]);
    expect(result.summaryZh).toContain('仅镜表有运镜');
    expect(result.summaryZh).toContain('3D 导演台未提供机位描述');
    expect(result.notes.some((n) => n.includes('未提交机位'))).toBe(true);
  });

  it('只有 3D 导演台有运镜 ⇒ source=director3d，并标注来自 3D 机位短语', () => {
    const result = mergeCameraMoveChannels({
      videoPrompt: '主角推门而入，走向窗边',
      director3dCameraPrompt: 'close up, camera movement: slowly dollies in',
    });
    expect(result.source).toBe('director3d');
    expect(result.director3d.moveIds).toEqual(['push-slow']);
    expect(result.conflicts).toEqual([]);
    expect(result.summaryZh).toContain('仅 3D 导演台有运镜');
    expect(result.summaryZh).toContain('由 3D 机位短语映射');
  });

  it('两通道都没运镜 ⇒ 明确说明，而不是编一个运镜', () => {
    const result = mergeCameraMoveChannels({ videoPrompt: '空镜头：雨滴落在窗台', director3dCameraPrompt: '' });
    expect(result.source).toBe('video');
    expect(result.video.moveIds).toEqual([]);
    expect(result.director3d.moveIds).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.summaryZh).toContain('两通道都没有可识别的运镜描述');
  });

  it('3D 通道未命中任何机位短语 ⇒ 进 notes，不冒充运镜', () => {
    const result = mergeCameraMoveChannels({
      videoPrompt: videoPush,
      director3dCameraPrompt: 'wide establishing shot of the harbour at dawn, 35mm',
    });
    expect(result.director3d.vocab).toBe('none');
    expect(result.director3d.moveIds).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.notes.some((n) => n.includes('未命中任何已知机位'))).toBe(true);
  });

  it('镜表时间轴总时长 ≠ 本镜时长 ⇒ [时长不一致]', () => {
    const videoPrompt = withMoveTimelinePrompt(
      null,
      tl(6, [{ moveId: 'push-slow', startT: 0, endT: 6 }]),
      { lang: 'en' },
    );
    const result = mergeCameraMoveChannels({ videoPrompt, shotDurationSec: 9 });
    expect(result.conflicts.some((c) => c.startsWith('[时长不一致]'))).toBe(true);
  });

  it('总时长与本镜一致时不报时长冲突', () => {
    const videoPrompt = withMoveTimelinePrompt(
      null,
      tl(6, [{ moveId: 'push-slow', startT: 0, endT: 6 }]),
      { lang: 'en' },
    );
    const result = mergeCameraMoveChannels({
      videoPrompt,
      director3dCameraPrompt: 'camera movement: slow dolly in',
      shotDurationSec: 6,
    });
    expect(result.conflicts).toEqual([]);
    expect(result.video.timeline).not.toBeNull();
    expect(result.summaryZh).toContain('0–6 秒');
    expect(result.summaryZh).toContain('总 6 秒');
  });

  it('镜表多段运镜的摘要含各段区间（3D 未提交时按镜表渲染）', () => {
    const videoPrompt = withMoveTimelinePrompt(
      null,
      tl(6, [
        { moveId: 'push-slow', startT: 0, endT: 3 },
        { moveId: 'pan-follow', startT: 3, endT: 6 },
      ]),
      { lang: 'en' },
    );
    const result = mergeCameraMoveChannels({ videoPrompt, director3dCameraPrompt: null, shotDurationSec: 6 });
    expect(result.conflicts).toEqual([]);
    expect(result.summaryZh).toContain('0–3 秒');
    expect(result.summaryZh).toContain('3–6 秒');
    expect(result.summaryEn).toContain('0-3s');
  });

  it('镜表出现多条运镜行 ⇒ [通道重复]', () => {
    const videoPrompt = [
      withCameraMovePrompt(null, ['push-slow'], { lang: 'en' }),
      withCameraMovePrompt(null, ['zoom-in'], { lang: 'en' }),
    ].join('\n');
    const result = mergeCameraMoveChannels({ videoPrompt, director3dCameraPrompt: null });
    expect(result.video.cameraLineCount).toBe(2);
    expect(result.conflicts.some((c) => c.startsWith('[通道重复]'))).toBe(true);
  });

  it('未命中词库的镜表短语进 notes，且不被丢弃', () => {
    const videoPrompt = '正文\ncamera movement: 自定义手摇跟拍';
    const result = mergeCameraMoveChannels({ videoPrompt, director3dCameraPrompt: null });
    expect(result.video.unresolvedPhrases).toEqual(['自定义手摇跟拍']);
    expect(result.notes.some((n) => n.includes('未命中运镜词库'))).toBe(true);
  });

  it('3D 平台皮肤短语（luma `camera push in` / hailuo `[Push in]`）同样被识别', () => {
    const luma = mergeCameraMoveChannels({
      videoPrompt: withCameraMovePrompt(null, ['push-slow'], { lang: 'en' }),
      director3dCameraPrompt: 'wide static composition, camera push in',
    });
    expect(luma.director3d.moveIds).toEqual(['push-slow']);
    expect(luma.conflicts).toEqual([]);

    const hailuo = mergeCameraMoveChannels({
      videoPrompt: withCameraMovePrompt(null, ['pull-slow'], { lang: 'en' }),
      director3dCameraPrompt: 'wide static composition [Pull out]',
    });
    expect(hailuo.director3d.moveIds).toEqual(['pull-slow']);
    expect(hailuo.conflicts).toEqual([]);
  });

  it('findDirector3dMovePhrases：命中顺序与短语原文可核对', () => {
    const hits = findDirector3dMovePhrases('camera movement: slow dolly in, then orbits around the subject');
    expect(hits.map((h) => h.cameraMoveId)).toEqual(['dolly-in', 'orbit']);
    expect(hits.map((h) => h.moveId)).toEqual(['push-slow', 'orbit-180']);
    expect(DIRECTOR3D_CAMERA_MOVE_PHRASES.every((p) => p.lang === 'en')).toBe(true);
  });

  it('mergeShotCameraMoveChannels：字段取值顺序与 videoField 对账', () => {
    const fromBreakdown = mergeShotCameraMoveChannels({
      videoPrompt: withCameraMovePrompt(null, ['push-slow'], { lang: 'en' }),
      videoPromptEn: withCameraMovePrompt(null, ['zoom-in'], { lang: 'en' }),
      durationSec: 6,
      director3dGuide: { cameraPrompt: 'camera movement: slow dolly in' },
    });
    expect(fromBreakdown.videoField).toBe('videoPrompt');
    expect(fromBreakdown.video.moveIds).toEqual(['push-slow']);
    expect(fromBreakdown.source).toBe('both');
    expect(fromBreakdown.conflicts).toEqual([]);

    const fromStoryboard = mergeShotCameraMoveChannels({
      videoPrompt: null,
      videoPromptEn: withCameraMovePrompt(null, ['crane-up'], { lang: 'en' }),
      durationSec: 6,
      director3dGuide: { cameraPrompt: 'camera movement: cranes up' },
    });
    expect(fromStoryboard.videoField).toBe('videoPromptEn');
    expect(fromStoryboard.video.moveIds).toEqual(['crane-up']);
    expect(fromStoryboard.conflicts).toEqual([]);

    expect(mergeShotCameraMoveChannels(null).source).toBe('video');
    expect(mergeShotCameraMoveChannels(undefined).conflicts).toEqual([]);
  });
});
