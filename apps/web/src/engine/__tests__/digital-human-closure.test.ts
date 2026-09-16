/**
 * digital-human-closure.test.ts —— 「数字人 / 演员库」本轮补缺的纯函数回归 + **未重复造真源**守卫。
 *
 * 被测模块（均为本轮新增，纯函数层）：
 * - `apps/web/src/engine/character-voice-binding.ts`（角色 ↔ 声线档案绑定）
 * - `apps/web/src/engine/multi-character-ref-coverage.ts`（多角色同框参考图覆盖）
 *
 * 路径纪律：本文件所有 import 与源码读取**一律走相对路径直取源码**，
 * 不经过 `@nx9/shared` barrel（barrel 引用了 8 个不存在的 `data/*` 模块，走 barrel 会直接解析失败，
 * 见 docs/NX9-DIGITAL-HUMAN-AUDIT.md）。被测模块对共享类型只用 `import type`（编译期抹除），
 * 因此运行时零 barrel 依赖。
 *
 * 三个层次的断言：
 * 1. **行为**：解析 / 匹配 / 合并（幂等）/ 清除（幂等）的正确性；
 * 2. **等价**：`planCharacterReferenceCoverage().primary` 必须恒等于既有
 *    `pickReferenceImage(characters, [])` —— 防止「UI 展示的注入图」与「实际发送的注入图」漂移；
 * 3. **守卫**：本轮**没有**新增第二套角色数组 / 声线映射真源，也**没有**新增持久化字段名。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildSpeakerVoiceMapFromCharacters,
  characterReferenceKey,
  characterVoiceProfileIdPatch,
  isVoiceProfileVoiceId,
  matchCharacterBySpeaker,
  mergeSpeakerVoiceMap,
  normalizeSpeakerName,
  resolveCharacterVoiceBinding,
  stripSpeakerVoiceMapForCharacters,
  type VoiceProfileLike,
} from '../character-voice-binding';
import {
  describeCharacterReferenceCoverageZh,
  hasCharacterReferenceGap,
  pickCharacterReferenceUrl,
  planCharacterReferenceCoverage,
} from '../multi-character-ref-coverage';
import { pickReferenceImage } from '../../../../../packages/shared/src/utils/character-prompt';
import type { CharacterProfile } from '../../../../../packages/shared/src/types/character';

const engine = resolve(__dirname, '..');
const repoRoot = resolve(__dirname, '../../../../..');

/* ───────────────────────── 夹具 ───────────────────────── */

const PROFILES: VoiceProfileLike[] = [
  { id: 'vp-1', name: '低沉男声', voiceId: 'onyx', provider: 'openai-compatible' },
  { id: 'vp-2', name: '清冷女声', voiceId: 'shimmer', provider: 'luxtts' },
  { id: 'vp-3', name: '空音色', voiceId: '   ' },
];

const char = (
  partial: Partial<CharacterProfile> & { id: string; name: string },
): CharacterProfile =>
  ({ voiceProfileId: null, referenceImageUrl: null, ...partial }) as CharacterProfile;

/* ══════════════════ 1. 角色 ↔ 声线档案：解析 ══════════════════ */

describe('resolveCharacterVoiceBinding：解析既有 voiceProfileId', () => {
  it('已绑定且档案可用 → 解析出引擎 voiceId', () => {
    const c = char({ id: 'c1', name: '林小满', voiceProfileId: 'vp-1' });
    expect(resolveCharacterVoiceBinding(c, PROFILES)).toEqual({
      characterId: 'c1',
      characterName: '林小满',
      profileId: 'vp-1',
      profileName: '低沉男声',
      voiceId: 'onyx',
      provider: 'openai-compatible',
    });
  });

  it('未绑定 / 空串 / 空白 → null（不编造缺省音色）', () => {
    expect(resolveCharacterVoiceBinding(char({ id: 'c1', name: 'A' }), PROFILES)).toBeNull();
    expect(
      resolveCharacterVoiceBinding(char({ id: 'c1', name: 'A', voiceProfileId: '' }), PROFILES),
    ).toBeNull();
    expect(
      resolveCharacterVoiceBinding(char({ id: 'c1', name: 'A', voiceProfileId: '   ' }), PROFILES),
    ).toBeNull();
  });

  it('绑定 id 在档案表里不存在 → null（失效引用不静默降级）', () => {
    expect(
      resolveCharacterVoiceBinding(char({ id: 'c1', name: 'A', voiceProfileId: 'vp-gone' }), PROFILES),
    ).toBeNull();
  });

  it('档案 voiceId 为空白 → null（禁止落 alloy 之类假缺省）', () => {
    expect(
      resolveCharacterVoiceBinding(char({ id: 'c1', name: 'A', voiceProfileId: 'vp-3' }), PROFILES),
    ).toBeNull();
  });

  it('character 为 null/undefined → null', () => {
    expect(resolveCharacterVoiceBinding(null, PROFILES)).toBeNull();
    expect(resolveCharacterVoiceBinding(undefined, PROFILES)).toBeNull();
  });
});

describe('characterVoiceProfileIdPatch：只产出既有字段 voiceProfileId', () => {
  it('返回对象键**恰好**是 voiceProfileId（不夹带任何新字段名）', () => {
    expect(Object.keys(characterVoiceProfileIdPatch('vp-1'))).toEqual(['voiceProfileId']);
  });

  it('去空白；空串/null/undefined → 解绑为 null', () => {
    expect(characterVoiceProfileIdPatch('  vp-2  ')).toEqual({ voiceProfileId: 'vp-2' });
    expect(characterVoiceProfileIdPatch('')).toEqual({ voiceProfileId: null });
    expect(characterVoiceProfileIdPatch('   ')).toEqual({ voiceProfileId: null });
    expect(characterVoiceProfileIdPatch(null)).toEqual({ voiceProfileId: null });
    expect(characterVoiceProfileIdPatch(undefined)).toEqual({ voiceProfileId: null });
  });
});

/* ══════════════════ 2. 角色 ↔ 声线档案：匹配与注入 ══════════════════ */

describe('matchCharacterBySpeaker / normalizeSpeakerName', () => {
  it('按正式 name 匹配，忽略大小写与首尾空白', () => {
    const cs = [char({ id: 'c1', name: 'Lin XiaoMan' })];
    expect(matchCharacterBySpeaker(' lin xiaoman ', cs)?.id).toBe('c1');
    expect(normalizeSpeakerName('  ABC ')).toBe('abc');
  });

  it('匹配不到 → undefined（不猜）', () => {
    expect(matchCharacterBySpeaker('旁白', [char({ id: 'c1', name: '林小满' })])).toBeUndefined();
    expect(matchCharacterBySpeaker('', [char({ id: 'c1', name: '林小满' })])).toBeUndefined();
  });
});

describe('buildSpeakerVoiceMapFromCharacters：只对有绑定的角色产出条目', () => {
  const characters = [
    char({ id: 'c1', name: '林小满', voiceProfileId: 'vp-1' }),
    char({ id: 'c2', name: '苏晚', voiceProfileId: null }),
    char({ id: 'c3', name: '陆行舟', voiceProfileId: 'vp-2' }),
  ];

  it('有绑定 → 写引擎 voiceId；未绑定 → 缺席（不是 alloy）', () => {
    const map = buildSpeakerVoiceMapFromCharacters(characters, ['林小满', '苏晚', '陆行舟', '旁白'], PROFILES);
    expect(map).toEqual({ 林小满: 'onyx', 陆行舟: 'shimmer' });
    expect(map['苏晚']).toBeUndefined();
    expect(map['旁白']).toBeUndefined();
  });

  it('speaker 重复时只记一次，不覆盖', () => {
    const map = buildSpeakerVoiceMapFromCharacters(characters, ['林小满', '林小满'], PROFILES);
    expect(Object.keys(map)).toEqual(['林小满']);
  });

  it('空 speaker 被忽略', () => {
    expect(buildSpeakerVoiceMapFromCharacters(characters, ['', '   '], PROFILES)).toEqual({});
  });
});

describe('mergeSpeakerVoiceMap：只补空位（幂等）', () => {
  const speakers = ['林小满', '苏晚'];
  const incoming = { 林小满: 'onyx', 苏晚: 'shimmer' };

  it('首次注入补入全部空位', () => {
    const r = mergeSpeakerVoiceMap({}, incoming, speakers);
    expect(r.map).toEqual(incoming);
    expect(r.added).toEqual(['林小满', '苏晚']);
    expect(r.kept).toEqual([]);
  });

  it('**幂等**：第二次调用 added 为空、map 不变', () => {
    const first = mergeSpeakerVoiceMap({}, incoming, speakers);
    const second = mergeSpeakerVoiceMap(first.map, incoming, speakers);
    expect(second.added).toEqual([]);
    expect(second.kept).toEqual(['林小满', '苏晚']);
    expect(second.map).toEqual(first.map);
  });

  it('用户手选优先：已有非空值的 speaker 不被覆盖', () => {
    const r = mergeSpeakerVoiceMap({ 林小满: 'nova' }, incoming, speakers);
    expect(r.map['林小满']).toBe('nova');
    expect(r.kept).toContain('林小满');
    expect(r.map['苏晚']).toBe('shimmer');
  });

  it('既有映射里的空值视为空位，会被补上', () => {
    const r = mergeSpeakerVoiceMap({ 林小满: '  ' }, incoming, speakers);
    expect(r.map['林小满']).toBe('onyx');
    expect(r.added).toContain('林小满');
  });

  it('已不在 speakers 里的陈旧键被清理并报出（防节点 data 无限增长）', () => {
    const r = mergeSpeakerVoiceMap({ 老角色: 'onyx', 林小满: 'nova' }, incoming, speakers);
    expect(r.pruned).toEqual(['老角色']);
    expect(r.map).toEqual({ 林小满: 'nova', 苏晚: 'shimmer' });
  });

  it('不传 speakers 时不做清理（保守）', () => {
    const r = mergeSpeakerVoiceMap({ 老角色: 'onyx' }, incoming);
    expect(r.pruned).toEqual([]);
    expect(r.map['老角色']).toBe('onyx');
  });

  it('null/undefined 既有映射按空处理', () => {
    expect(mergeSpeakerVoiceMap(null, incoming, speakers).added).toEqual(['林小满', '苏晚']);
    expect(mergeSpeakerVoiceMap(undefined, incoming, speakers).added).toEqual(['林小满', '苏晚']);
  });
});

describe('stripSpeakerVoiceMapForCharacters：可清除（幂等）', () => {
  const characters = [
    char({ id: 'c1', name: '林小满', voiceProfileId: 'vp-1' }),
    char({ id: 'c2', name: '苏晚', voiceProfileId: 'vp-2' }),
  ];
  const speakers = ['林小满', '苏晚'];

  it('清除与角色当前绑定音色相同的条目', () => {
    const r = stripSpeakerVoiceMapForCharacters(
      { 林小满: 'onyx', 苏晚: 'shimmer' },
      characters,
      speakers,
      PROFILES,
    );
    expect(r.map).toEqual({});
    expect(r.removed).toEqual(['林小满', '苏晚']);
  });

  it('手选成**非绑定音色**的条目不受影响（不误删用户选择）', () => {
    const r = stripSpeakerVoiceMapForCharacters(
      { 林小满: 'nova', 苏晚: 'shimmer' },
      characters,
      speakers,
      PROFILES,
    );
    expect(r.map).toEqual({ 林小满: 'nova' });
    expect(r.removed).toEqual(['苏晚']);
  });

  it('**幂等**：第二次调用 removed 为空、map 不变', () => {
    const once = stripSpeakerVoiceMapForCharacters({ 林小满: 'onyx' }, characters, speakers, PROFILES);
    const twice = stripSpeakerVoiceMapForCharacters(once.map, characters, speakers, PROFILES);
    expect(twice.removed).toEqual([]);
    expect(twice.map).toEqual(once.map);
  });

  it('与 merge 互逆：merge 后 strip 回到起点', () => {
    const base = { 苏晚: 'nova' };
    const merged = mergeSpeakerVoiceMap(
      base,
      buildSpeakerVoiceMapFromCharacters(characters, speakers, PROFILES),
      speakers,
    );
    expect(merged.map).toEqual({ 苏晚: 'nova', 林小满: 'onyx' });
    const stripped = stripSpeakerVoiceMapForCharacters(merged.map, characters, speakers, PROFILES);
    expect(stripped.map).toEqual(base);
  });

  it('角色未绑定 → 无可清除项（不误判）', () => {
    const r = stripSpeakerVoiceMapForCharacters(
      { 林小满: 'onyx' },
      [char({ id: 'c1', name: '林小满' })],
      speakers,
      PROFILES,
    );
    expect(r.removed).toEqual([]);
    expect(r.map).toEqual({ 林小满: 'onyx' });
  });
});

describe('characterReferenceKey / isVoiceProfileVoiceId', () => {
  it('char:<id> 是既有「角色参考音」约定，不被当成声线档案音色', () => {
    expect(characterReferenceKey(' c1 ')).toBe('char:c1');
    expect(isVoiceProfileVoiceId('char:c1', PROFILES)).toBe(false);
  });

  it('只有确实是某档案 voiceId 的值才为 true', () => {
    expect(isVoiceProfileVoiceId('onyx', PROFILES)).toBe(true);
    expect(isVoiceProfileVoiceId('alloy', PROFILES)).toBe(false);
    expect(isVoiceProfileVoiceId('', PROFILES)).toBe(false);
  });
});

/* ══════════════════ 3. 多角色同框参考图覆盖 ══════════════════ */

describe('pickCharacterReferenceUrl：字段优先级与既有 pickReferenceImage 一致', () => {
  it('referenceImageUrl > fullSheetUrl > frontViewUrl', () => {
    expect(
      pickCharacterReferenceUrl({
        id: 'c1',
        name: 'A',
        referenceImageUrl: ' r.png ',
        creative: { fullSheetUrl: 'f.png', frontViewUrl: 'v.png' },
      }),
    ).toEqual({ url: 'r.png', source: 'referenceImageUrl' });
    expect(
      pickCharacterReferenceUrl({ id: 'c1', name: 'A', creative: { fullSheetUrl: 'f.png', frontViewUrl: 'v.png' } }),
    ).toEqual({ url: 'f.png', source: 'fullSheetUrl' });
    expect(
      pickCharacterReferenceUrl({ id: 'c1', name: 'A', creative: { frontViewUrl: 'v.png' } }),
    ).toEqual({ url: 'v.png', source: 'frontViewUrl' });
  });

  it('空白串不算有图', () => {
    expect(pickCharacterReferenceUrl({ id: 'c1', name: 'A', referenceImageUrl: '   ' })).toBeNull();
    expect(pickCharacterReferenceUrl(null)).toBeNull();
  });
});

describe('planCharacterReferenceCoverage：多角色同框的覆盖账', () => {
  const c1 = char({ id: 'c1', name: '林小满', referenceImageUrl: 'a.png' });
  const c2 = char({ id: 'c2', name: '苏晚', creative: { fullSheetUrl: 'b.png' } as never });
  const c3 = char({ id: 'c3', name: '陆行舟', creative: { frontViewUrl: 'c.png' } as never });
  const c4 = char({ id: 'c4', name: '路人甲' });

  it('单槽：只有第一位有图角色进请求，其余如实报 notInjected', () => {
    const cov = planCharacterReferenceCoverage([c1, c2, c3, c4]);
    expect(cov.total).toBe(4);
    expect(cov.injected.map((x) => x.characterName)).toEqual(['林小满']);
    expect(cov.notInjected.map((x) => x.characterName)).toEqual(['苏晚', '陆行舟']);
    expect(cov.missing.map((x) => x.characterName)).toEqual(['路人甲']);
    expect(cov.primary).toBe('a.png');
  });

  it('顺序敏感：第一位无图时顺延到下一个有图角色（与 pickReferenceImage 同序）', () => {
    const cov = planCharacterReferenceCoverage([c4, c2, c1]);
    expect(cov.injected.map((x) => x.characterName)).toEqual(['苏晚']);
    expect(cov.notInjected.map((x) => x.characterName)).toEqual(['林小满']);
    expect(cov.missing.map((x) => x.characterName)).toEqual(['路人甲']);
    expect(cov.primary).toBe('b.png');
  });

  it('**等价守卫**：primary 恒等于既有 pickReferenceImage(characters, [])', () => {
    const cases: CharacterProfile[][] = [
      [],
      [c1],
      [c4],
      [c1, c2, c3, c4],
      [c4, c2, c1],
      [c4, c4],
      [c3, c4],
    ];
    for (const list of cases) {
      expect(planCharacterReferenceCoverage(list).primary).toBe(pickReferenceImage(list, []));
    }
  });

  it('slotLimit>1 时按槽位放开（为未来多槽预留，口径一致）', () => {
    const cov = planCharacterReferenceCoverage([c1, c2, c3, c4], 2);
    expect(cov.injected.map((x) => x.characterName)).toEqual(['林小满', '苏晚']);
    expect(cov.notInjected.map((x) => x.characterName)).toEqual(['陆行舟']);
    expect(cov.primary).toBe('a.png');
  });

  it('空输入 / null → 全空，不抛异常', () => {
    expect(planCharacterReferenceCoverage([]).candidates).toEqual([]);
    expect(planCharacterReferenceCoverage(null).total).toBe(0);
    expect(planCharacterReferenceCoverage(undefined).primary).toBeUndefined();
  });

  it('缺失角色的 characterId 一并带出（便于跳转补图）', () => {
    expect(planCharacterReferenceCoverage([c1, c4]).missing[0]?.characterId).toBe('c4');
  });
});

describe('describeCharacterReferenceCoverageZh / hasCharacterReferenceGap', () => {
  const withImg = (id: string, name: string, url: string) =>
    char({ id, name, referenceImageUrl: url });

  it('单角色有图 → 无缺口，文案为 null（不打扰）', () => {
    const cov = planCharacterReferenceCoverage([withImg('c1', 'A', 'a.png')]);
    expect(hasCharacterReferenceGap(cov)).toBe(false);
    expect(describeCharacterReferenceCoverageZh(cov)).toBeNull();
  });

  it('无角色 → 无缺口', () => {
    const cov = planCharacterReferenceCoverage([]);
    expect(hasCharacterReferenceGap(cov)).toBe(false);
    expect(describeCharacterReferenceCoverageZh(cov)).toBeNull();
  });

  it('两位角色只注入一位 → 如实说明另一位只靠 Prompt', () => {
    const cov = planCharacterReferenceCoverage([
      withImg('c1', '林小满', 'a.png'),
      withImg('c2', '苏晚', 'b.png'),
    ]);
    const note = describeCharacterReferenceCoverageZh(cov);
    expect(note).toContain('苏晚');
    expect(note).toContain('只靠 Prompt 一致性描述');
    expect(note).not.toContain('已一致');
  });

  it('缺参考图单独成句', () => {
    const cov = planCharacterReferenceCoverage([withImg('c1', '林小满', 'a.png'), char({ id: 'c2', name: '苏晚' })]);
    const note = describeCharacterReferenceCoverageZh(cov);
    expect(note).toContain('缺参考图：苏晚');
  });
});

/* ══════════════════ 4. 未重复造真源 / 未新增字段名 守卫 ══════════════════ */

/**
 * 只扫**产品源码**：跳过依赖目录与 `__tests__`（本文件自身也会出现被禁标识符的字面量，
 * 不应把自己的断言文本算成命中）。
 */
function sourceFiles(root: string, exts: string[], skip = new Set(['node_modules', '.git', 'dist', 'coverage', '__tests__'])): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (exts.some((e) => entry.endsWith(e)) && !/\.(test|spec)\./.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function countMatches(files: string[], re: RegExp): Array<{ file: string; hits: number }> {
  const out: Array<{ file: string; hits: number }> = [];
  for (const file of files) {
    const hits = (readFileSync(file, 'utf8').match(re) ?? []).length;
    if (hits > 0) out.push({ file, hits });
  }
  return out;
}

const NEW_MODULES = ['character-voice-binding.ts', 'multi-character-ref-coverage.ts'];

describe('守卫：本轮补缺未新增第二套真源、未新增持久化字段名', () => {
  const sharedAndWeb = sourceFiles(resolve(repoRoot, 'packages/shared/src'), ['.ts', '.tsx']).concat(
    sourceFiles(resolve(repoRoot, 'apps/web/src'), ['.ts', '.tsx']),
  );

  it('全仓只有**一个** CharacterProfile 结构定义（未造第二套角色真源）', () => {
    const decls = countMatches(sharedAndWeb, /export\s+interface\s+CharacterProfile\b/g);
    expect(decls.map((d) => resolve(d.file).replace(repoRoot, '').split('\\').join('/'))).toEqual([
      '/packages/shared/src/types/character.ts',
    ]);
  });

  it('未出现 CharacterProfileV2 / CharacterRecord / CharacterLibrary2 之类的并行真源', () => {
    expect(countMatches(sharedAndWeb, /\b(CharacterProfileV2|CharacterProfile2|CharacterRecord|CharacterLibrary2)\b/g)).toEqual([]);
  });

  it('全仓只有**一处** resolveCharacterReferenceAudio 定义（未造第二套声线解析真源）', () => {
    const decls = countMatches(sharedAndWeb, /export\s+function\s+resolveCharacterReferenceAudio\b/g);
    expect(decls).toHaveLength(1);
    expect(resolve(decls[0]!.file).replace(repoRoot, '').split('\\').join('/')).toBe(
      '/packages/shared/src/types/sound-library.ts',
    );
  });

  it('新增模块为纯函数层：无 React 状态、无节点 data 写入、不 import @nx9/shared barrel', () => {
    for (const name of NEW_MODULES) {
      const src = readFileSync(resolve(engine, name), 'utf8');
      expect(src, `${name} 不应持有组件状态`).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref)\b/);
      expect(src, `${name} 不应写节点 data`).not.toMatch(/\bupdateNodeData\b/);
      expect(src, `${name} 不应直连 barrel`).not.toMatch(/from\s+['"]@nx9\/shared['"]/);
      expect(src, `${name} 不应发网络请求`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('新增模块未引入任何新的 speaker→voice / 角色数组字段名', () => {
    const forbidden = [
      'profileMapV2',
      'voiceProfileMap',
      'characterVoiceMap',
      'speakerVoiceProfiles',
      'characterProfiles',
      'voiceBindings',
      'characterVoiceProfiles',
    ];
    for (const name of NEW_MODULES) {
      const src = readFileSync(resolve(engine, name), 'utf8');
      for (const key of forbidden) expect(src, `${name} 出现疑似新字段 ${key}`).not.toContain(key);
    }
  });

  it('配音链路的 speaker→voice 映射仍只落在既有 data.profileMap（唯一写入形态）', () => {
    const src = readFileSync(resolve(repoRoot, 'apps/web/src/blocks/nx9/VoiceCastBlock.tsx'), 'utf8');
    // 本轮新增的两个入口都只写既有 profileMap
    expect(src).toContain('updateNodeData(props.id, { profileMap: map });');
    expect(src).not.toContain('profileMapV2');
    expect(src).not.toContain('voiceProfileMap');
    // 原有手动选择的写入形态未被改动
    expect(src).toContain('updateNodeData(props.id, { profileMap: next });');
  });

  it('角色详情只写既有 voiceProfileId（未新增角色持久化字段）', () => {
    const src = readFileSync(resolve(repoRoot, 'apps/web/src/panels/asset-library/AssetDetailFields.tsx'), 'utf8');
    expect(src).toContain('patch({ voiceProfileId: e.target.value || null })');
    expect(src).not.toContain('voiceProfileIdV2');
    expect(src).not.toContain('characterVoiceProfile');
  });

  it('出图链路的单槽参考图实现保持原样（本轮只做只读诊断，未改注入行为）', () => {
    const shared = readFileSync(resolve(repoRoot, 'packages/shared/src/utils/character-prompt.ts'), 'utf8');
    // pickReferenceImage 仍是「遍历取第一个有图角色」
    expect(shared).toContain('export function pickReferenceImage(');
    expect(shared).toContain('if (url) return url;');
    const refs = readFileSync(resolve(repoRoot, 'apps/web/src/engine/picture-gen-refs.ts'), 'utf8');
    expect(refs).toContain("injected.push({ url: characterRef, role: 'character' })");
  });
});
