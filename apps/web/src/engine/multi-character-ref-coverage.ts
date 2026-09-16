/**
 * multi-character-ref-coverage.ts —— 多角色同框时**参考图覆盖**的纯函数诊断层。
 *
 * 缺口背景（见 docs/NX9-DIGITAL-HUMAN-AUDIT.md）：
 * 出图链路的角色一致性有两条腿 —— ①Prompt 文字一致性（`characterPromptSuffix`，多角色逐条成块，已完备）
 * ②角色参考图。但参考图注入是**单槽**的：
 * `character-prompt.ts` 的 `pickReferenceImage` 只返回**第一个**有图的角色，
 * `picture-gen-refs.ts` 的 `resolvePictureSendRefs` 也只接受单个 `characterRef`。
 * 结果：一个镜头挂 3 个角色时，第 2、3 个角色的定妆图**进不了生成请求**，
 * 界面上也看不出这件事——用户以为「角色都锁了」，实际只锁了第一位。
 *
 * 本模块不改既有单槽行为（`pickReferenceImage` 原样保留），只把**真实覆盖情况如实算出来**，
 * 供分镜镜编辑面板如实展示；`primary` 与 `pickReferenceImage(characters, [])` 恒等
 * （单测以相对路径直取源码做等价断言），因此展示与实际发送**同源**，不会出现「UI 说注入了、实际没注入」。
 *
 * 无新数据源：角色仍来自 workspace `CharacterProfile[]`，候选顺序与字段优先级与既有实现完全一致。
 */
import type { CharacterProfile } from '../../../../packages/shared/src/types/character';

/** 本模块只消费这三个字段；`creative` 仅取两个既有参考图槽位。 */
export type CharacterRefSourceLike = {
  id: string;
  name: string;
  referenceImageUrl?: string | null;
  creative?: {
    fullSheetUrl?: string | null;
    frontViewUrl?: string | null;
  } | null;
};

export type CharacterRefField = 'referenceImageUrl' | 'fullSheetUrl' | 'frontViewUrl';

export interface CharacterRefCandidate {
  characterId: string;
  characterName: string;
  url: string;
  /** 命中的既有字段，便于用户回去补图 */
  source: CharacterRefField;
}

export interface CharacterRefGap {
  characterId: string;
  characterName: string;
}

export interface CharacterReferenceCoverage {
  /** 参与本镜的角色数 */
  total: number;
  /** 有可用参考图的角色（顺序 = 既有 pickReferenceImage 的遍历顺序） */
  candidates: CharacterRefCandidate[];
  /** 实际会进入生成请求的候选（受单槽上限约束） */
  injected: CharacterRefCandidate[];
  /** 有参考图但进不了请求的角色 —— 同框时最容易掉链子的一档 */
  notInjected: CharacterRefCandidate[];
  /** 完全没有参考图的角色（只能靠 Prompt 描述） */
  missing: CharacterRefGap[];
  /** 与 `pickReferenceImage(characters, [])` 恒等的首位参考图 */
  primary?: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 取单个角色的参考图（字段优先级与既有 `pickReferenceImage` 完全一致）。 */
export function pickCharacterReferenceUrl(
  character: CharacterRefSourceLike | null | undefined,
): { url: string; source: CharacterRefField } | null {
  if (!character) return null;
  const direct = text(character.referenceImageUrl);
  if (direct) return { url: direct, source: 'referenceImageUrl' };
  const full = text(character.creative?.fullSheetUrl);
  if (full) return { url: full, source: 'fullSheetUrl' };
  const front = text(character.creative?.frontViewUrl);
  if (front) return { url: front, source: 'frontViewUrl' };
  return null;
}

/**
 * 按既有单槽口径算出多角色同框时的参考覆盖账。
 * @param slotLimit 生成请求实际能塞进的角色参考位数（既有实现为 1）
 */
export function planCharacterReferenceCoverage(
  characters: ReadonlyArray<CharacterRefSourceLike> | null | undefined,
  slotLimit = 1,
): CharacterReferenceCoverage {
  const list = Array.isArray(characters) ? characters : [];
  const candidates: CharacterRefCandidate[] = [];
  const missing: CharacterRefGap[] = [];
  for (const character of list) {
    const hit = pickCharacterReferenceUrl(character);
    if (hit) {
      candidates.push({
        characterId: character.id,
        characterName: text(character.name),
        url: hit.url,
        source: hit.source,
      });
    } else {
      missing.push({ characterId: character.id, characterName: text(character.name) });
    }
  }
  const slots = Number.isFinite(slotLimit) && slotLimit > 0 ? Math.floor(slotLimit) : 0;
  const injected = candidates.slice(0, slots);
  return {
    total: list.length,
    candidates,
    injected,
    notInjected: candidates.slice(slots),
    missing,
    primary: injected[0]?.url,
  };
}

/**
 * 是否值得提示（单角色或有图且都被注入 → 无需打扰）。
 */
export function hasCharacterReferenceGap(coverage: CharacterReferenceCoverage): boolean {
  return coverage.notInjected.length > 0 || coverage.missing.length > 0;
}

/**
 * 如实的中文说明；无缺口时返回 `null`（调用方据此不渲染）。
 * 文案只陈述事实，不承诺「已一致」。
 */
export function describeCharacterReferenceCoverageZh(
  coverage: CharacterReferenceCoverage,
): string | null {
  if (!hasCharacterReferenceGap(coverage)) return null;
  const parts: string[] = [];
  if (coverage.notInjected.length > 0) {
    parts.push(
      `仅前 ${coverage.injected.length} 位角色的参考图会进生成请求（本镜共 ${coverage.candidates.length} 位有图角色）：` +
        coverage.notInjected.map((c) => c.characterName || c.characterId).join('、') +
        ' 只靠 Prompt 一致性描述',
    );
  }
  if (coverage.missing.length > 0) {
    parts.push(
      `缺参考图：${coverage.missing.map((c) => c.characterName || c.characterId).join('、')}（仅靠 Prompt 一致性描述）`,
    );
  }
  return parts.join('；');
}

/** 也接受完整 `CharacterProfile[]`（结构化兼容，避免调用方再做映射）。 */
export type CharacterRefSourceLikeFromProfile = Pick<
  CharacterProfile,
  'id' | 'name' | 'referenceImageUrl'
> & {
  creative?: CharacterProfile['creative'] | null;
};
