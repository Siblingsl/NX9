import {
  FACE_RIG_DEADZONE,
  FACE_RIG_GROUPS,
  FACE_RIG_MAX,
  FACE_RIG_MIN,
  FACE_RIG_PARAMS,
  FACE_RIG_PARAMS_BY_ID,
  FACE_RIG_PRESETS_BY_ID,
  type FaceRigParamDef,
} from '../data/character-face-rig-presets';
import type { CharacterProfile } from '../types/character';
import type {
  CharacterBodyMetrics,
  CharacterFaceRig,
  FaceRigGroupId,
} from '../types/creative-asset-center';

/** 强度分档：|v| → 修饰词 */
const STRENGTH_TIERS: Array<{ min: number; word: string }> = [
  { min: 90, word: '极致' },
  { min: 70, word: '强烈' },
  { min: 45, word: '明显' },
  { min: FACE_RIG_DEADZONE, word: '轻微' },
];

/** 单次编译最多写入的条目数；超限先降级到强偏离项 */
const FACE_RIG_PROMPT_MAX_ITEMS = 18;
/** 降级后的偏离阈值 */
const FACE_RIG_STRONG_THRESHOLD = 45;

export function emptyFaceRig(): CharacterFaceRig {
  return { version: 1, values: {} };
}

function clampValue(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded === 0) return null;
  return Math.min(FACE_RIG_MAX, Math.max(FACE_RIG_MIN, rounded));
}

/**
 * 归一化读取：补默认、夹取值域、丢弃未知参数与错组参数。
 * 读侧统一走这里，避免旧数据/手改 JSON 污染编译结果。
 */
export function getFaceRig(source: CharacterProfile | CharacterFaceRig | undefined): CharacterFaceRig {
  const raw: CharacterFaceRig | undefined =
    source && 'creative' in source ? source.creative?.faceRig : (source as CharacterFaceRig | undefined);
  if (!raw) return emptyFaceRig();

  const values: NonNullable<CharacterFaceRig['values']> = {};
  for (const group of FACE_RIG_GROUPS) {
    const bucket = raw.values?.[group.id];
    if (!bucket) continue;
    const next: Record<string, number> = {};
    for (const [id, v] of Object.entries(bucket)) {
      const def = FACE_RIG_PARAMS_BY_ID.get(id);
      if (!def || def.group !== group.id) continue;
      const clamped = clampValue(v);
      if (clamped == null) continue;
      next[id] = clamped;
    }
    if (Object.keys(next).length > 0) values[group.id] = next;
  }

  const asymmetric = (raw.asymmetric ?? []).filter((id) => FACE_RIG_PARAMS_BY_ID.has(id));

  const sideValues: NonNullable<CharacterFaceRig['sideValues']> = {};
  for (const [id, sides] of Object.entries(raw.sideValues ?? {})) {
    if (!FACE_RIG_PARAMS_BY_ID.has(id)) continue;
    const next: { L?: number; R?: number } = {};
    const l = clampValue(sides?.L);
    const r = clampValue(sides?.R);
    if (l != null) next.L = l;
    if (r != null) next.R = r;
    if (Object.keys(next).length > 0) sideValues[id] = next;
  }

  return {
    version: 1,
    values,
    ...(asymmetric.length > 0 ? { asymmetric } : {}),
    ...(Object.keys(sideValues).length > 0 ? { sideValues } : {}),
    ...(raw.presetId ? { presetId: raw.presetId } : {}),
    ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
    ...(raw.renderedAt ? { renderedAt: raw.renderedAt } : {}),
    ...(raw.meshContractVersion ? { meshContractVersion: raw.meshContractVersion } : {}),
    ...(raw.faceLockHash ? { faceLockHash: raw.faceLockHash } : {}),
  };
}

export function faceRigValue(rig: CharacterFaceRig | undefined, id: string): number {
  const def = FACE_RIG_PARAMS_BY_ID.get(id);
  if (!def) return 0;
  return rig?.values?.[def.group]?.[id] ?? 0;
}

/** 写单项：0 值不落库，保持指纹稳定 */
export function setFaceRigValue(
  rig: CharacterFaceRig | undefined,
  id: string,
  value: number,
): CharacterFaceRig {
  const def = FACE_RIG_PARAMS_BY_ID.get(id);
  const base = getFaceRig(rig);
  if (!def) return base;

  const clamped = clampValue(value);
  const bucket = { ...(base.values?.[def.group] ?? {}) };
  if (clamped == null) delete bucket[id];
  else bucket[id] = clamped;

  const values = { ...(base.values ?? {}) };
  if (Object.keys(bucket).length > 0) values[def.group] = bucket;
  else delete values[def.group];

  const sideValues = { ...(base.sideValues ?? {}) };
  delete sideValues[id];

  const next = { ...base, values };
  if (Object.keys(sideValues).length > 0) next.sideValues = sideValues;
  else delete next.sideValues;
  return { ...next, updatedAt: Date.now() };
}

/** 读单侧扩展值：sideValues 优先，未写的一侧回退基础值 */
export function faceRigSideValue(
  rig: CharacterFaceRig | undefined,
  id: string,
  side: 'L' | 'R',
): number {
  const def = FACE_RIG_PARAMS_BY_ID.get(id);
  if (!def) return 0;
  const base = getFaceRig(rig);
  return base.sideValues?.[id]?.[side] ?? faceRigValue(base, id);
}

/** 写单侧扩展值：0 值不落库；同时登记 asymmetric，未写的一侧仍回退基础值 */
export function setFaceRigSideValue(
  rig: CharacterFaceRig | undefined,
  id: string,
  side: 'L' | 'R',
  value: number,
): CharacterFaceRig {
  const def = FACE_RIG_PARAMS_BY_ID.get(id);
  const base = getFaceRig(rig);
  if (!def) return base;
  const clamped = clampValue(value);
  const sides = { ...(base.sideValues?.[id] ?? {}) };
  if (clamped == null) delete sides[side];
  else sides[side] = clamped;
  const sideValues = { ...(base.sideValues ?? {}), [id]: sides };
  if (Object.keys(sides).length === 0) delete sideValues[id];
  const asymmetric = Array.from(new Set([...(base.asymmetric ?? []), id]));
  const next = { ...base };
  if (asymmetric.length > 0) next.asymmetric = asymmetric;
  else delete next.asymmetric;
  if (Object.keys(sideValues).length > 0) next.sideValues = sideValues;
  else delete next.sideValues;
  return { ...next, updatedAt: Date.now() };
}

/** 某分组下的全部参数定义（UI 展开分组用） */
export function faceRigParamsOfGroup(group: FaceRigGroupId): FaceRigParamDef[] {
  return FACE_RIG_PARAMS.filter((p) => p.group === group);
}

export function resetFaceRigGroup(
  rig: CharacterFaceRig | undefined,
  group: FaceRigGroupId,
): CharacterFaceRig {
  const base = getFaceRig(rig);
  const values = { ...(base.values ?? {}) };
  delete values[group];
  const sideValues = { ...(base.sideValues ?? {}) };
  for (const p of faceRigParamsOfGroup(group)) delete sideValues[p.id];
  const next = { ...base, values };
  if (Object.keys(sideValues).length > 0) next.sideValues = sideValues;
  else delete next.sideValues;
  return { ...next, updatedAt: Date.now() };
}

/** 应用内置预设：只覆盖预设写到的项，其余保留 */
export function applyFaceRigPreset(
  rig: CharacterFaceRig | undefined,
  presetId: string,
): CharacterFaceRig {
  const preset = FACE_RIG_PRESETS_BY_ID.get(presetId);
  const base = getFaceRig(rig);
  if (!preset) return base;

  let next: CharacterFaceRig = { ...base, values: { ...(base.values ?? {}) } };
  for (const [, bucket] of Object.entries(preset.values)) {
    for (const [id, v] of Object.entries(bucket ?? {})) {
      next = setFaceRigValue(next, id, v);
    }
  }
  return { ...next, presetId, updatedAt: Date.now() };
}

export interface FaceRigDeviation {
  def: FaceRigParamDef;
  value: number;
  /** 生效的语义词（未带强度） */
  word: string;
  /** 强度修饰词 */
  strength: string;
}

function strengthOf(abs: number): string | null {
  for (const tier of STRENGTH_TIERS) {
    if (abs >= tier.min) return tier.word;
  }
  return null;
}

/** 列出所有偏离中性的项（按分组顺序、组内按字典顺序） */
export function listFaceRigDeviations(rig: CharacterFaceRig | undefined): FaceRigDeviation[] {
  const normalized = getFaceRig(rig);
  const out: FaceRigDeviation[] = [];
  for (const def of FACE_RIG_PARAMS) {
    const value = normalized.values?.[def.group]?.[def.id] ?? 0;
    const abs = Math.abs(value);
    const strength = strengthOf(abs);
    if (!strength) continue;
    out.push({ def, value, word: value > 0 ? def.high : def.low, strength });
  }
  return out;
}

export function countFaceRigDeviations(rig: CharacterFaceRig | undefined): number {
  return listFaceRigDeviations(rig).length;
}

export function isFaceRigNeutral(rig: CharacterFaceRig | undefined): boolean {
  return listFaceRigDeviations(rig).length === 0;
}

/** bodyMetrics 已有实测值的维度 → 对应参数 id（编译时跳过，避免数值与形容互相矛盾） */
export function faceRigSkipBodyIds(metrics: CharacterBodyMetrics | undefined): string[] {
  if (!metrics) return [];
  return FACE_RIG_PARAMS.filter(
    (p) => p.bodyMetricKey && String(metrics[p.bodyMetricKey] ?? '').trim(),
  ).map((p) => p.id);
}

/** 除体型外的面部分组 */
export const FACE_RIG_FACE_GROUPS: FaceRigGroupId[] = FACE_RIG_GROUPS
  .map((g) => g.id)
  .filter((id) => id !== 'body');

export interface BuildFaceRigPromptOptions {
  /** 只编译这些分组；缺省为全部 */
  groups?: FaceRigGroupId[];
  /** 跳过的参数 id（一般来自 faceRigSkipBodyIds） */
  skipIds?: string[];
  /** 省略「参数锁最高优先级」抬头（并入 appearanceLock 时用） */
  omitPriorityNote?: boolean;
  /** 省略结尾一致性约束句 */
  omitConsistencyNote?: boolean;
}

/**
 * 编译成中文结构描述。
 *
 * 三条硬规则：
 * 1) 只写偏离项 —— 全中性时返回空串，Prompt 不膨胀
 * 2) 结构优先于描述 —— 抬头显式声明覆盖同类自由描述
 * 3) 不越界 —— 不写颜色 / 服装 / 表情 / 数值单位
 */
export function buildFaceRigPrompt(
  rig: CharacterFaceRig | undefined,
  opts: BuildFaceRigPromptOptions = {},
): string {
  const skip = new Set(opts.skipIds ?? []);
  const allowGroups = opts.groups ? new Set(opts.groups) : null;
  let deviations = listFaceRigDeviations(rig).filter(
    (d) => !skip.has(d.def.id) && (!allowGroups || allowGroups.has(d.def.group)),
  );
  if (deviations.length === 0) return '';

  if (deviations.length > FACE_RIG_PROMPT_MAX_ITEMS) {
    const strong = deviations.filter((d) => Math.abs(d.value) >= FACE_RIG_STRONG_THRESHOLD);
    deviations = strong.length > 0 ? strong : deviations;
  }
  if (deviations.length > FACE_RIG_PROMPT_MAX_ITEMS) {
    deviations = [...deviations]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, FACE_RIG_PROMPT_MAX_ITEMS);
  }

  const lines: string[] = [];
  if (!opts.omitPriorityNote) {
    lines.push('以下结构参数为最高优先级，与同类自由描述冲突时以本段为准。');
  }

  for (const group of FACE_RIG_GROUPS) {
    const items = deviations.filter((d) => d.def.group === group.id);
    if (items.length === 0) continue;
    const body = items.map((d) => `${d.word}（${d.strength}）`).join('；');
    lines.push(`${group.sentenceLabel}：${body}。`);
  }

  const asymmetric = (getFaceRig(rig).asymmetric ?? [])
    .map((id) => FACE_RIG_PARAMS_BY_ID.get(id))
    .filter((def): def is FaceRigParamDef => Boolean(def) && (!allowGroups || allowGroups.has(def!.group)))
    .map((def) => def.labelZh);
  if (asymmetric.length > 0) {
    lines.push(`允许左右轻微不对称：${asymmetric.join('、')}。`);
  }

  if (!opts.omitConsistencyNote) {
    lines.push('一致性：以上结构在所有视图、表情、角度中保持不变；禁止五官比例漂移。');
  }

  return lines.join('\n');
}

/** 人类可读逐项摘要（UI 显示用） */
export function describeFaceRig(rig: CharacterFaceRig | undefined): string[] {
  return listFaceRigDeviations(rig).map(
    (d) => `${d.def.labelZh} ${d.value > 0 ? '+' : ''}${d.value} · ${d.word}（${d.strength}）`,
  );
}

/**
 * 参数指纹：与取值一一对应，与写入顺序无关。
 * 用于漂移检测与「参数已改但定妆图未重出」判定。
 */
export function faceRigHash(rig: CharacterFaceRig | undefined): string {
  const normalized = getFaceRig(rig);
  const parts: string[] = [];
  for (const def of FACE_RIG_PARAMS) {
    const v = normalized.values?.[def.group]?.[def.id];
    if (v) parts.push(`${def.id}=${v}`);
  }
  for (const id of [...(normalized.asymmetric ?? [])].sort()) parts.push(`asym:${id}`);
  for (const [id, sides] of Object.entries(normalized.sideValues ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!sides) continue;
    if (sides.L != null) parts.push(`${id}.L=${sides.L}`);
    if (sides.R != null) parts.push(`${id}.R=${sides.R}`);
  }
  if (parts.length === 0) return '0';

  // FNV-1a 32bit
  let hash = 0x811c9dc5;
  const seed = parts.join('|');
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}