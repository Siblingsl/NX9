/**
 * 休眠预设接入层回归（增量新增能力）。
 *
 * 覆盖面：`packages/shared/src/data/*` 中原本「有数据、没入口」的 7 组预设，
 * 经 `preset-entrypoints` / `blocking-layout` 接成前端入口后的行为契约。
 *
 * 注意：本文件的 import 走**相对路径直取 shared 源码**，而不是 '@nx9/shared'。
 * 原因：`packages/shared/src/index.ts` 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会让本测试无法解析；相对路径只依赖被接入的预设与新增适配层，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  FOREIGN_PROMPT_PREFIXES,
  PRESET_SECTION_KEYS,
  PRESET_SECTION_LABELS,
  PRESET_SECTION_PREFIX,
  PRESET_SECTION_PRESETS,
  PICTURE_SIZE_PRESET_OPTIONS,
  animeTagToPromptPreset,
  buildAnimeTagPrompt,
  buildCinemaPresetPrompt,
  buildLightRigMultiPrompt,
  buildPortraitPresetPrompt,
  buildSectionPrompt,
  composePresetSections,
  groupPromptPresets,
  lightRigToPromptPreset,
  matchPictureGenSize,
  parsePictureGenSize,
  pictureSizePresetPatch,
  portraitToPromptPreset,
  readPresetSections,
  withAnimeTagPrompt,
  withCinemaPrompt,
  withLightRigPrompt,
  withPortraitPrompt,
  withSectionPrompt,
  type PresetSectionKey,
} from '../../../../../packages/shared/src/utils/preset-entrypoints';
import {
  BLOCKING_LAYOUT_IDS,
  BLOCKING_LINE_SPACING,
  BLOCKING_TRIANGLE_RADIUS,
  blockingCameraPatch,
  blockingCameraPreset,
  blockingLayoutLabel,
  listBlockingCameraPresets,
  listBlockingLayouts,
  solveBlockingLayout,
} from '../../../../../packages/shared/src/utils/blocking-layout';
import { ANIME_TAG_PRESETS } from '../../../../../packages/shared/src/data/anime-tag-presets';
import {
  BLOCKING_CAMERA_PRESETS,
  BLOCKING_LAYOUTS,
} from '../../../../../packages/shared/src/data/blocking-presets';
import { PICTURE_GEN_SIZES } from '../../../../../packages/shared/src/data/gen-models';
import { LIGHT_RIG_PRESETS } from '../../../../../packages/shared/src/data/light-rig-presets';
import { PORTRAIT_PRESETS } from '../../../../../packages/shared/src/data/portrait-presets';
import {
  CINEMA_PROMPT_PRESETS,
  CAMERA_PROMPT_PRESETS,
} from '../../../../../packages/shared/src/data/prompt-presets';
import {
  CAMERA_MOVE_PROMPT_PREFIX_EN,
  CAMERA_MOVE_PROMPT_PREFIX_ZH,
  withCameraMovePrompt,
} from '../../../../../packages/shared/src/data/camera-move-library';

/** 每个 section 的代表性 id（取词表前两条，保证真实存在）。 */
const SECTION_IDS: Record<PresetSectionKey, string[]> = {
  cinema: CINEMA_PROMPT_PRESETS.slice(0, 2).map((p) => p.id),
  lighting: LIGHT_RIG_PRESETS.slice(0, 2).map((p) => p.id),
  portrait: PORTRAIT_PRESETS.slice(0, 2).map((p) => p.id),
  anime: ANIME_TAG_PRESETS.slice(0, 2).map((p) => p.id),
};

const WITHERS: Record<PresetSectionKey, (text: string, ids: string[]) => string> = {
  cinema: withCinemaPrompt,
  lighting: withLightRigPrompt,
  portrait: withPortraitPrompt,
  anime: withAnimeTagPrompt,
};

const BASE_WITH_CAMERA_MOVE = [
  '一位剑客站在雨夜的巷口',
  `${CAMERA_MOVE_PROMPT_PREFIX_EN} slow dolly in (total 6s, beat-aligned)`,
].join('\n');

describe('被接入的预设数组本身未被修改', () => {
  it('条数与 id 与源码词表一致，且 section 词表是对原数组的只读引用/适配', () => {
    expect(CINEMA_PROMPT_PRESETS).toHaveLength(8);
    expect(CAMERA_PROMPT_PRESETS).toHaveLength(8);
    expect(LIGHT_RIG_PRESETS).toHaveLength(6);
    expect(PORTRAIT_PRESETS).toHaveLength(12);
    expect(ANIME_TAG_PRESETS).toHaveLength(10);
    expect(BLOCKING_CAMERA_PRESETS).toHaveLength(5);
    expect(BLOCKING_LAYOUTS).toHaveLength(3);
    expect(PICTURE_GEN_SIZES).toHaveLength(3);

    // 电影感直接复用原数组（同一引用，未复制替换）
    expect(PRESET_SECTION_PRESETS.cinema).toBe(CINEMA_PROMPT_PRESETS);

    // 灯光 / 人像 / 动漫标签走只读适配，字段一一对应且未改原数组
    expect(PRESET_SECTION_PRESETS.lighting[0]).toEqual(
      lightRigToPromptPreset(LIGHT_RIG_PRESETS[0]),
    );
    expect(PRESET_SECTION_PRESETS.lighting[0].text).toBe(LIGHT_RIG_PRESETS[0].prompt);
    expect(PRESET_SECTION_PRESETS.portrait[0]).toEqual(
      portraitToPromptPreset(PORTRAIT_PRESETS[0]),
    );
    expect(PRESET_SECTION_PRESETS.portrait[0].text).toBe(PORTRAIT_PRESETS[0].tags);
    expect(PRESET_SECTION_PRESETS.anime[0]).toEqual(animeTagToPromptPreset(ANIME_TAG_PRESETS[0]));
    expect(PRESET_SECTION_PRESETS.anime[0].text).toBe(ANIME_TAG_PRESETS[0].tags);
  });

  it('4 个 section 各有前缀与中文标签，且分组视图非空', () => {
    for (const key of PRESET_SECTION_KEYS) {
      expect(PRESET_SECTION_PREFIX[key], key).toBeTruthy();
      expect(PRESET_SECTION_LABELS[key], key).toBeTruthy();
      const presets = PRESET_SECTION_PRESETS[key];
      expect(presets.length, key).toBeGreaterThan(0);
      const grouped = groupPromptPresets(presets);
      expect(grouped.length, key).toBeGreaterThan(0);
      expect(grouped.reduce((n, g) => n + g.items.length, 0), key).toBe(presets.length);
    }
  });
});

describe('注入幂等：同一 section 反复套用不堆叠', () => {
  it.each([...PRESET_SECTION_KEYS])('%s：一次与两次结果完全相同', (key) => {
    const base = '一位剑客站在雨夜的巷口';
    const once = WITHERS[key](base, SECTION_IDS[key]);
    const twice = WITHERS[key](once, SECTION_IDS[key]);
    const thrice = WITHERS[key](twice, SECTION_IDS[key]);
    expect(once).not.toBe(base);
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
  });

  it('幂等也适用于多段正文 + 已存在同 section 行的场景', () => {
    const text = '第一行\n第二行';
    const once = withCinemaPrompt(text, SECTION_IDS.cinema);
    expect(withCinemaPrompt(once, SECTION_IDS.cinema)).toBe(once);
    expect(once).toContain('第一行');
    expect(once).toContain('第二行');
  });

  it('section 行永远只有一行', () => {
    let text = 'base';
    for (let i = 0; i < 5; i += 1) text = withLightRigPrompt(text, SECTION_IDS.lighting);
    const hits = text
      .split('\n')
      .filter((l) => l.trim().toLowerCase().startsWith(PRESET_SECTION_PREFIX.lighting));
    expect(hits).toHaveLength(1);
  });
});

describe('清除干净：空 id 列表移除该 section 行', () => {
  it.each([...PRESET_SECTION_KEYS])('%s：清除后回到原文', (key) => {
    const base = '一位剑客站在雨夜的巷口';
    const injected = WITHERS[key](base, SECTION_IDS[key]);
    const cleared = WITHERS[key](injected, []);
    expect(cleared).toBe(base);
    expect(readPresetSections(cleared)[key]).toBeUndefined();
  });

  it.each([...PRESET_SECTION_KEYS])('%s：清除不影响其它 section 与正文', (key) => {
    let text = '正文 A\n正文 B';
    for (const k of PRESET_SECTION_KEYS) text = WITHERS[k](text, SECTION_IDS[k]);
    const cleared = WITHERS[key](text, []);
    expect(cleared).toContain('正文 A');
    expect(cleared).toContain('正文 B');
    for (const k of PRESET_SECTION_KEYS) {
      if (k === key) {
        expect(readPresetSections(cleared)[k]).toBeUndefined();
      } else {
        expect(readPresetSections(cleared)[k], k).toBeTruthy();
      }
    }
  });

  it('清除后不留累积空行', () => {
    const base = '正文';
    let text = base;
    for (let i = 0; i < 4; i += 1) {
      text = withCinemaPrompt(text, SECTION_IDS.cinema);
      text = withCinemaPrompt(text, []);
    }
    expect(text).toBe(base);
  });
});

describe('空选择不变更提示词', () => {
  const TEXTS = [
    '',
    '单行正文',
    '第一行\n第二行',
    '第一行\n\n第三行',
    BASE_WITH_CAMERA_MOVE,
  ];

  it.each([...PRESET_SECTION_KEYS])('%s：空 ids 对各类原文逐字节不变', (key) => {
    for (const text of TEXTS) {
      expect(WITHERS[key](text, []), key).toBe(text);
    }
  });

  it('空 ids 且原文无 section 行时，composePresetSections 亦不变更', () => {
    for (const text of TEXTS) {
      expect(composePresetSections(text, {})).toBe(text);
      expect(composePresetSections(text, { cinema: '' })).toBe(text);
      expect(composePresetSections(text, { anime: '   ' })).toBe(text);
    }
  });

  it('未知 id 被忽略；全部未知视为空选择，不写行', () => {
    const text = '正文';
    expect(withCinemaPrompt(text, ['cine-not-exist'])).toBe(text);
    expect(buildCinemaPresetPrompt(['cine-not-exist'])).toBe('');
    expect(buildLightRigMultiPrompt(['not-a-rig'])).toBe('');
    expect(buildPortraitPresetPrompt(['not-a-portrait'])).toBe('');
    expect(buildAnimeTagPrompt(['not-a-tag'])).toBe('');
  });

  it('灯光：未知 id 不会回退成首条预设（避免「选错了却看似成功」）', () => {
    expect(buildLightRigMultiPrompt(['three-point-soft'])).toBe(LIGHT_RIG_PRESETS[0].prompt);
    expect(buildLightRigMultiPrompt(['three-point-soft', 'bogus'])).toBe(
      LIGHT_RIG_PRESETS[0].prompt,
    );
  });
});

describe('组合顺序稳定', () => {
  const base = '一位剑客站在雨夜的巷口';

  it('套用顺序不同，结果文本一致（按规范 section 顺序落行）', () => {
    let a = base;
    for (const k of PRESET_SECTION_KEYS) a = WITHERS[k](a, SECTION_IDS[k]);

    let b = base;
    for (const k of [...PRESET_SECTION_KEYS].reverse()) b = WITHERS[k](b, SECTION_IDS[k]);

    expect(b).toBe(a);
  });

  it('section 行严格按 PRESET_SECTION_KEYS 顺序排列', () => {
    let text = base;
    for (const k of [...PRESET_SECTION_KEYS].reverse()) text = WITHERS[k](text, SECTION_IDS[k]);
    const lines = text.split('\n');
    const positions = PRESET_SECTION_KEYS.map((k) =>
      lines.findIndex((l) => l.trim().toLowerCase().startsWith(PRESET_SECTION_PREFIX[k])),
    );
    for (const p of positions) expect(p).toBeGreaterThanOrEqual(0);
    const sorted = [...positions].sort((x, y) => x - y);
    expect(positions).toEqual(sorted);
  });

  it('同一 section 内片段顺序由词表决定，与选中先后无关', () => {
    const [id1, id2] = SECTION_IDS.cinema;
    expect(buildCinemaPresetPrompt([id2, id1])).toBe(buildCinemaPresetPrompt([id1, id2]));
    expect(withCinemaPrompt(base, [id2, id1])).toBe(withCinemaPrompt(base, [id1, id2]));

    // 乱序 + 重复 + 空值一并归一
    expect(withCinemaPrompt(base, [id2, '', id1, id2, null, undefined])).toBe(
      withCinemaPrompt(base, [id1, id2]),
    );
  });
});

describe('与既有注入（大师运镜 / 运镜时间轴 / 节拍对齐）互不覆盖且可共存', () => {
  it.each([...PRESET_SECTION_KEYS])('%s：注入不破坏既有运镜行', (key) => {
    const next = WITHERS[key](BASE_WITH_CAMERA_MOVE, SECTION_IDS[key]);
    expect(next).toContain('一位剑客站在雨夜的巷口');
    expect(next).toContain(`${CAMERA_MOVE_PROMPT_PREFIX_EN} slow dolly in (total 6s, beat-aligned)`);
  });

  it('先注入预设、再套用运镜，预设行仍保留', () => {
    const withPresets = withCinemaPrompt(withPortraitPrompt('正文', SECTION_IDS.portrait), SECTION_IDS.cinema);
    const withMove = withCameraMovePrompt(withPresets, ['push-slow'], { lang: 'en' });
    expect(withMove).toContain(`${CAMERA_MOVE_PROMPT_PREFIX_EN} `);
    expect(readPresetSections(withMove).cinema).toBeTruthy();
    expect(readPresetSections(withMove).portrait).toBeTruthy();
    expect(withMove).toContain('正文');
  });

  it('中文运镜行（运镜：）同样被保留', () => {
    const zh = ['正文', `${CAMERA_MOVE_PROMPT_PREFIX_ZH}缓推`].join('\n');
    const next = withAnimeTagPrompt(zh, SECTION_IDS.anime);
    expect(next).toContain(`${CAMERA_MOVE_PROMPT_PREFIX_ZH}缓推`);
  });

  it('重复套用预设不会吞掉运镜行（幂等与共存同时成立）', () => {
    const once = withLightRigPrompt(BASE_WITH_CAMERA_MOVE, SECTION_IDS.lighting);
    const twice = withLightRigPrompt(once, SECTION_IDS.lighting);
    expect(twice).toBe(once);
    expect(twice).toContain(CAMERA_MOVE_PROMPT_PREFIX_EN);
  });

  it('运镜前缀被声明为外来行，不属本模块拥有', () => {
    for (const p of FOREIGN_PROMPT_PREFIXES) {
      expect(Object.values(PRESET_SECTION_PREFIX)).not.toContain(p);
    }
  });
});

describe('选中态反推的前提：同 section 内无「片段互为子串」', () => {
  it.each([...PRESET_SECTION_KEYS])('%s：任意两条片段互不包含', (key) => {
    const fragments = PRESET_SECTION_PRESETS[key].map((p) => buildSectionPrompt(key, [p.id]));
    fragments.forEach((f, i) => expect(f, `${key}[${i}] 片段为空`).toBeTruthy());
    for (let i = 0; i < fragments.length; i += 1) {
      for (let j = 0; j < fragments.length; j += 1) {
        if (i === j) continue;
        expect(fragments[i].includes(fragments[j]), `${key}: [${i}] 包含 [${j}]`).toBe(false);
      }
    }
  });

  it('readPresetSections 能从注入文本反推回原始片段', () => {
    for (const key of PRESET_SECTION_KEYS) {
      const ids = SECTION_IDS[key];
      const text = WITHERS[key]('正文', ids);
      const section = readPresetSections(text)[key] ?? '';
      expect(section).toBe(buildSectionPrompt(key, ids));
      // 反推的片段必须能被原 id 的片段命中（UI 勾选态来源）
      for (const id of ids) {
        expect(section.includes(buildSectionPrompt(key, [id])), `${key}/${id}`).toBe(true);
      }
    }
  });

  it('人像 extra 附加文本不影响反推', () => {
    const ids = SECTION_IDS.portrait;
    const text = withPortraitPrompt('正文', ids, 'cinematic rim light');
    const section = readPresetSections(text).portrait ?? '';
    for (const id of ids) {
      expect(section.includes(buildSectionPrompt('portrait', [id]))).toBe(true);
    }
    expect(section).toContain('cinematic rim light');
  });
});

describe('出图尺寸预设（PICTURE_GEN_SIZES）映射到既有字段', () => {
  it('词表只读转出，条数与 id 一致', () => {
    expect(PICTURE_SIZE_PRESET_OPTIONS.map((o) => o.id)).toEqual(PICTURE_GEN_SIZES.map((s) => s.id));
  });

  it('id → 既有 aspectRatio/width/height 补丁，不新增字段名', () => {
    for (const size of PICTURE_GEN_SIZES) {
      const patch = pictureSizePresetPatch(size.id);
      expect(patch, size.id).toBeTruthy();
      expect(Object.keys(patch!).sort()).toEqual(['aspectRatio', 'height', 'width']);
      expect(patch!.aspectRatio).toBe('custom');
      expect(`${patch!.width}x${patch!.height}`).toBe(size.id);
    }
  });

  it('非法 / 未知尺寸返回 undefined（不静默套用首条）', () => {
    expect(parsePictureGenSize(undefined)).toBeUndefined();
    expect(parsePictureGenSize('')).toBeUndefined();
    expect(parsePictureGenSize('2048x2048')).toBeUndefined();
    expect(pictureSizePresetPatch('not-a-size')).toBeUndefined();
  });

  it('由既有 width/height 反查命中预设', () => {
    expect(matchPictureGenSize(1024, 1024)).toBe('1024x1024');
    expect(matchPictureGenSize(1024, 1792)).toBe('1024x1792');
    expect(matchPictureGenSize(1792, 1024)).toBe('1792x1024');
    expect(matchPictureGenSize(1000, 1000)).toBeUndefined();
    expect(matchPictureGenSize(undefined, 1024)).toBeUndefined();
  });
});

describe('场面调度：机位词表', () => {
  it('只读转出 5 条，id 与源码一致', () => {
    expect(listBlockingCameraPresets().map((p) => p.id)).toEqual(
      BLOCKING_CAMERA_PRESETS.map((p) => p.id),
    );
  });

  it('机位 id → 既有 DirectorCameraShot 补丁字段', () => {
    const patch = blockingCameraPatch('master-wide');
    expect(patch).toEqual({
      name: 'Master Wide',
      fov: 42,
      target: [0, 1, 0],
      position: [0, 2.2, 7],
    });
    expect(Object.keys(patch!).sort()).toEqual(['fov', 'name', 'position', 'target']);
  });

  it('未知机位返回 undefined，不做静默兜底', () => {
    expect(blockingCameraPatch('ots-nowhere')).toBeUndefined();
    expect(blockingCameraPreset(null)).toBeUndefined();
  });

  it('返回的补丁是拷贝，改动不会污染词表', () => {
    const patch = blockingCameraPatch('medium')!;
    patch.position[0] = 999;
    expect(BLOCKING_CAMERA_PRESETS[1].position[0]).toBe(0);
  });
});

describe('场面调度：走位布局解算', () => {
  it('布局词表与标签', () => {
    expect(BLOCKING_LAYOUT_IDS).toEqual(['line', 'dialogue', 'triangle']);
    expect(listBlockingLayouts().map((l) => l.label)).toEqual([
      '一字排开',
      '对话对峙',
      '三角站位',
    ]);
    expect(blockingLayoutLabel('triangle')).toBe('三角站位');
    expect(blockingLayoutLabel('unknown')).toBe('unknown');
  });

  it('人数为 0 返回空数组；未知布局抛错而非假装成功', () => {
    expect(solveBlockingLayout('line', 0)).toEqual([]);
    expect(solveBlockingLayout('line', -3)).toEqual([]);
    // @ts-expect-error 故意传入非法 id，验证不做静默兜底
    expect(() => solveBlockingLayout('diagonal', 2)).toThrow(/未知走位布局/);
  });

  it('一字排开：等间距居中在 X 轴、站在地面、面向 +Z', () => {
    const out = solveBlockingLayout('line', 3);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.position[0])).toEqual([
      -BLOCKING_LINE_SPACING,
      0,
      BLOCKING_LINE_SPACING,
    ]);
    for (const p of out) {
      expect(p.position[1]).toBe(0);
      expect(p.position[2]).toBe(0);
      expect(p.rotation).toEqual([0, 0, 0]);
    }
  });

  it('对话对峙：左右两列分别朝 +X / -X', () => {
    const out = solveBlockingLayout('dialogue', 4);
    expect(out).toHaveLength(4);
    const left = out.filter((p) => p.position[0] < 0);
    const right = out.filter((p) => p.position[0] > 0);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    for (const p of left) expect(p.rotation[1]).toBeCloseTo(Math.PI / 2, 3);
    for (const p of right) expect(p.rotation[1]).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('三角站位：3 人在基准半径上，且各自朝向画面中心', () => {
    const out = solveBlockingLayout('triangle', 3);
    expect(out).toHaveLength(3);
    for (const p of out) {
      const [x, y, z] = p.position;
      expect(y).toBe(0);
      const radius = Math.hypot(x, z);
      expect(radius).toBeCloseTo(BLOCKING_TRIANGLE_RADIUS, 3);
      // 朝向 = 从站位指向原点
      const yaw = p.rotation[1];
      expect(Math.sin(yaw)).toBeCloseTo(-x / radius, 3);
      expect(Math.cos(yaw)).toBeCloseTo(-z / radius, 3);
    }
  });

  it('三角站位：人数超过 3 时按环外扩，半径递增', () => {
    const out = solveBlockingLayout('triangle', 4);
    expect(out).toHaveLength(4);
    const r3 = Math.hypot(out[0].position[0], out[0].position[2]);
    const r4 = Math.hypot(out[3].position[0], out[3].position[2]);
    expect(r4).toBeGreaterThan(r3);
  });

  it('同输入同输出（确定性）', () => {
    for (const layout of BLOCKING_LAYOUT_IDS) {
      for (const n of [1, 2, 3, 5, 8]) {
        expect(solveBlockingLayout(layout, n)).toEqual(solveBlockingLayout(layout, n));
      }
    }
  });

  it('所有布局、任意 1–9 人：y 恒为 0、坐标为有限数', () => {
    for (const layout of BLOCKING_LAYOUT_IDS) {
      for (let n = 1; n <= 9; n += 1) {
        const out = solveBlockingLayout(layout, n);
        expect(out, `${layout}/${n}`).toHaveLength(n);
        for (const p of out) {
          expect(p.position[1]).toBe(0);
          for (const v of [...p.position, ...p.rotation]) expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});
