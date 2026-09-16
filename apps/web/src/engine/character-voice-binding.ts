/**
 * character-voice-binding.ts —— 角色 ↔ 声线档案（`CharacterProfile.voiceProfileId`）绑定的**纯函数层**。
 *
 * 缺口背景（见 docs/NX9-DIGITAL-HUMAN-AUDIT.md）：
 * - `CharacterProfile.voiceProfileId` 早已在类型中声明，服务端也按「声线档案 id」读取
 *   （`apps/server/src/modules/workspace/voice-workspace.service.ts`：`c.voiceProfileId === profile?.id`），
 *   但**没有任何 UI 写入它**，配音侧也从不下沉该绑定 —— 角色详情只能上传/发布参考音，
 *   而「这个角色用哪个引擎音色」只能每次在配音节点里手选，且缺省落 `alloy`。
 *
 * 本模块只做**纯计算**，不碰 store / 网络 / React：
 * - 读：`resolveCharacterVoiceBinding` 解析既有 `voiceProfileId` → 声线档案 → 引擎 `voiceId`；
 * - 写：`characterVoiceProfileIdPatch` 只产出既有字段 `voiceProfileId`（不新增字段名）；
 * - 注入配音节点既有 `data.profileMap`（speaker → voiceId / `char:<id>`）时**幂等且可清除**：
 *   `mergeSpeakerVoiceMap` 只补空位（第二次调用 `added` 为空），
 *   `stripSpeakerVoiceMapForCharacters` 是它的逆运算，且**不额外持久化任何「哪些是自动写入」标记**——
 *   判据完全由「该 speaker 的角色当前绑定的 voiceId」当场算出，因此无需新字段。
 *
 * 与既有真源的关系：本模块**不新建**角色数组或声线映射的第二套真源，
 * 角色仍来自 workspace 的 `CharacterProfile[]`，声线仍来自 `voice.profiles`（`VoiceProfile[]`）。
 */
import type { CharacterProfile } from '../../../../packages/shared/src/types/character';
import type { VoiceProfile } from '../../../../packages/shared/src/types/storyboard';

/** 角色在本模块只需 name / voiceProfileId；`id` 用于生成 `char:<id>` 键。 */
export type CharacterVoiceSourceLike = {
  id: string;
  name: string;
  voiceProfileId?: string | null;
};

/** 声线档案在本模块只需 id / name / voiceId（provider 可选，仅用于展示）。 */
export type VoiceProfileLike = {
  id: string;
  name: string;
  voiceId: string;
  provider?: VoiceProfile['provider'] | string;
};

export interface CharacterVoiceBinding {
  characterId: string;
  characterName: string;
  /** 声线档案 id（即 `CharacterProfile.voiceProfileId` 的值） */
  profileId: string;
  /** 声线档案显示名 */
  profileName: string;
  /** 引擎侧音色 id（写入配音节点 `voice` / `profileMap` 的值） */
  voiceId: string;
  provider?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 按 name 归一化比较（去首尾空白 + 小写），与配音节点 speaker 匹配口径一致。 */
export function normalizeSpeakerName(value: string | null | undefined): string {
  return text(value).toLowerCase();
}

/**
 * 解析角色已绑定的声线档案。
 * 未绑定 / 档案不存在 / 档案 `voiceId` 为空 → `null`（禁止编造缺省音色）。
 */
export function resolveCharacterVoiceBinding(
  character: CharacterVoiceSourceLike | null | undefined,
  profiles: ReadonlyArray<VoiceProfileLike> = [],
): CharacterVoiceBinding | null {
  if (!character) return null;
  const profileId = text(character.voiceProfileId);
  if (!profileId) return null;
  const hit = profiles.find((p) => p.id === profileId);
  if (!hit) return null;
  const voiceId = text(hit.voiceId);
  if (!voiceId) return null;
  return {
    characterId: character.id,
    characterName: text(character.name),
    profileId: hit.id,
    profileName: text(hit.name) || hit.id,
    voiceId,
    provider: typeof hit.provider === 'string' ? hit.provider : undefined,
  };
}

/**
 * 产出只含**既有字段** `voiceProfileId` 的 patch。
 * `profileId` 传空串 / null → 解绑。
 */
export function characterVoiceProfileIdPatch(
  profileId: string | null | undefined,
): Pick<CharacterProfile, 'voiceProfileId'> {
  const next = text(profileId);
  return { voiceProfileId: next || null };
}

/** 配音节点既有约定：`char:<id>` 表示「用该角色的参考音走克隆」。 */
export function characterReferenceKey(characterId: string): string {
  return `char:${text(characterId)}`;
}

/** 是否为本模块自动匹配可产出的取值（= 某个声线档案的 voiceId）。 */
export function isVoiceProfileVoiceId(
  value: string | null | undefined,
  profiles: ReadonlyArray<VoiceProfileLike> = [],
): boolean {
  const v = text(value);
  if (!v || v.startsWith('char:')) return false;
  return profiles.some((p) => text(p.voiceId) === v);
}

/** 按 speaker 名（含角色别名不参与：只用正式 `name`）解析角色。 */
export function matchCharacterBySpeaker(
  speaker: string | null | undefined,
  characters: ReadonlyArray<CharacterVoiceSourceLike>,
): CharacterVoiceSourceLike | undefined {
  const key = normalizeSpeakerName(speaker);
  if (!key) return undefined;
  return characters.find((c) => normalizeSpeakerName(c.name) === key);
}

/**
 * 按「角色 → 已绑声线档案」生成 speaker → voiceId 映射。
 * 无法解析的角色**不产出条目**（保持缺席，交由用户在配音节点手选），不落 `alloy` 之类的假缺省。
 */
export function buildSpeakerVoiceMapFromCharacters(
  characters: ReadonlyArray<CharacterVoiceSourceLike>,
  speakers: ReadonlyArray<string>,
  profiles: ReadonlyArray<VoiceProfileLike> = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const speaker of speakers) {
    const key = text(speaker);
    if (!key || out[key] !== undefined) continue;
    const character = matchCharacterBySpeaker(key, characters);
    if (!character) continue;
    const binding = resolveCharacterVoiceBinding(character, profiles);
    if (!binding) continue;
    out[key] = binding.voiceId;
  }
  return out;
}

export interface MergeSpeakerVoiceMapResult {
  map: Record<string, string>;
  /** 本次真正补入的 speaker（幂等判据：第二次调用应为空数组） */
  added: string[];
  /** 因已有映射而跳过的 speaker */
  kept: string[];
}

/**
 * 把自动匹配结果**只补空位**地并入既有 `profileMap`。
 * 已有非空值的 speaker 一律保留（用户手选优先），因此可重复调用。
 * 既有映射里「已不在 speakers 中」的陈旧键会被清掉（防节点 data 无限增长），这类清理由 `pruned` 报出。
 */
export function mergeSpeakerVoiceMap(
  existing: Readonly<Record<string, string>> | null | undefined,
  incoming: Readonly<Record<string, string>>,
  speakers?: ReadonlyArray<string>,
): MergeSpeakerVoiceMapResult & { pruned: string[] } {
  const allowed = speakers && speakers.length > 0 ? new Set(speakers.map((s) => text(s))) : null;
  const map: Record<string, string> = {};
  const pruned: string[] = [];
  for (const [speaker, value] of Object.entries(existing ?? {})) {
    if (!text(speaker) || !text(value)) continue;
    if (allowed && !allowed.has(text(speaker))) {
      pruned.push(speaker);
      continue;
    }
    map[speaker] = value;
  }
  const added: string[] = [];
  const kept: string[] = [];
  for (const [speaker, value] of Object.entries(incoming)) {
    if (!text(speaker) || !text(value)) continue;
    if (allowed && !allowed.has(text(speaker))) continue;
    if (text(map[speaker])) {
      kept.push(speaker);
      continue;
    }
    map[speaker] = value;
    added.push(speaker);
  }
  return { map, added, kept, pruned };
}

/**
 * `mergeSpeakerVoiceMap` 的逆：清除「由本模块自动匹配写入」的条目。
 *
 * 判据当场算出、不依赖任何额外持久化标记：
 * speaker 对应的角色此刻绑定的 `voiceId` 与映射值相同 ⇒ 视为自动写入并移除。
 * 用户手选成**非绑定音色**的条目不受影响。
 */
export function stripSpeakerVoiceMapForCharacters(
  existing: Readonly<Record<string, string>> | null | undefined,
  characters: ReadonlyArray<CharacterVoiceSourceLike>,
  speakers: ReadonlyArray<string>,
  profiles: ReadonlyArray<VoiceProfileLike> = [],
): { map: Record<string, string>; removed: string[] } {
  const auto = buildSpeakerVoiceMapFromCharacters(characters, speakers, profiles);
  const map: Record<string, string> = {};
  const removed: string[] = [];
  for (const [speaker, value] of Object.entries(existing ?? {})) {
    if (!text(speaker) || !text(value)) continue;
    const autoValue = auto[speaker];
    if (autoValue && autoValue === text(value)) {
      removed.push(speaker);
      continue;
    }
    map[speaker] = value;
  }
  return { map, removed };
}
