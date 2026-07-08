import { ANGLE_PRESETS } from '../data/anime-tag-presets';
import {
  CHARACTER_EXPRESSION_PRESETS,
  CHARACTER_SHEET_POSE_PRESETS,
} from '../data/character-sheet-presets';

export interface CharacterSheetProfile {
  age?: string;
  height?: string;
  weight?: string;
  occupation?: string;
  personality?: string;
  background?: string;
  /** 识别特征 — 一致性最关键 */
  distinctiveFeatures?: string;
}

export interface CharacterSheetVariant {
  expressionId?: string;
  poseId?: string;
  angleId?: string;
}

export interface CharacterSheetInput {
  characterName?: string;
  profile?: CharacterSheetProfile;
  /** 完整角色设定图（如三视图+表情+动作拼板） */
  fullSheetUrl?: string;
  frontUrl?: string;
  sideUrl?: string;
  backUrl?: string;
  palette?: string;
  forbiddenTraits?: string;
  activeVariant?: CharacterSheetVariant;
}

function lookupExpression(id?: string) {
  return CHARACTER_EXPRESSION_PRESETS.find((p) => p.id === id);
}

function lookupPose(id?: string) {
  return CHARACTER_SHEET_POSE_PRESETS.find((p) => p.id === id);
}

function lookupAngle(id?: string) {
  return ANGLE_PRESETS.find((p) => p.id === id);
}

/** 拼一致性 prompt：恒定层 + 当前镜头变体 */
export function buildCharacterSheetPrompt(input: CharacterSheetInput): string {
  const name = input.characterName?.trim() || '角色';
  const p = input.profile ?? {};
  const parts: string[] = [`@${name}`];

  if (p.distinctiveFeatures?.trim()) {
    parts.push(p.distinctiveFeatures.trim());
  }
  if (p.occupation?.trim()) parts.push(p.occupation.trim());
  if (p.personality?.trim()) parts.push(p.personality.trim());

  const expr = lookupExpression(input.activeVariant?.expressionId);
  const pose = lookupPose(input.activeVariant?.poseId);
  const angle = lookupAngle(input.activeVariant?.angleId);
  if (expr) parts.push(expr.tags);
  if (pose) parts.push(pose.tags);
  if (angle) parts.push(angle.prompt);

  if (input.palette?.trim()) parts.push(`color palette: ${input.palette.trim()}`);
  if (input.forbiddenTraits?.trim()) parts.push(`avoid: ${input.forbiddenTraits.trim()}`);

  parts.push('consistent character design, same outfit and proportions across shots');
  return parts.filter(Boolean).join(', ');
}

/** 选参考图：完整设定图优先，其次三视图正面 */
export function pickCharacterSheetReference(input: CharacterSheetInput): string | undefined {
  return (
    input.fullSheetUrl?.trim() ||
    input.frontUrl?.trim() ||
    input.sideUrl?.trim() ||
    input.backUrl?.trim() ||
    undefined
  );
}

export function collectCharacterSheetPictures(input: CharacterSheetInput): string[] {
  const urls = [input.fullSheetUrl, input.frontUrl, input.sideUrl, input.backUrl];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u?.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** 写入 Backlot CharacterProfile 的一致性描述 */
export function buildCharacterConsistencyPrompt(input: CharacterSheetInput): string {
  const p = input.profile ?? {};
  const base = [p.distinctiveFeatures, p.occupation, p.personality, p.background]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join('. ');
  const variant = buildCharacterSheetPrompt(input);
  return base ? `${base}. ${variant}` : variant;
}

export function buildCharacterSheetMeta(input: CharacterSheetInput) {
  const variant = input.activeVariant ?? {};
  return {
    characterName: input.characterName?.trim() || '',
    profile: input.profile ?? {},
    palette: input.palette ?? '',
    forbidden: input.forbiddenTraits ?? '',
    activeVariant: variant,
    expressionLabel: lookupExpression(variant.expressionId)?.label,
    poseLabel: lookupPose(variant.poseId)?.label,
    angleLabel: lookupAngle(variant.angleId)?.label,
    turnaround: {
      front: input.frontUrl ?? '',
      side: input.sideUrl ?? '',
      back: input.backUrl ?? '',
    },
    fullSheetUrl: input.fullSheetUrl ?? '',
  };
}

export function applyCharacterSheetPatch(
  current: CharacterSheetInput,
  patch: Partial<CharacterSheetInput> & { profile?: Partial<CharacterSheetProfile> },
): CharacterSheetInput {
  return {
    ...current,
    ...patch,
    profile: { ...current.profile, ...patch.profile },
    activeVariant: patch.activeVariant
      ? { ...current.activeVariant, ...patch.activeVariant }
      : current.activeVariant,
  };
}

export function characterSheetFromNodeData(data: Record<string, unknown> | undefined): CharacterSheetInput {
  const profile = (data?.profile as CharacterSheetProfile | undefined) ?? {};
  return {
    characterName: (data?.characterName as string) ?? '',
    profile: {
      age: profile.age ?? (data?.age as string),
      height: profile.height ?? (data?.height as string),
      weight: profile.weight ?? (data?.weight as string),
      occupation: profile.occupation ?? (data?.occupation as string),
      personality: profile.personality ?? (data?.personality as string),
      background: profile.background ?? (data?.background as string),
      distinctiveFeatures:
        profile.distinctiveFeatures ?? (data?.distinctiveFeatures as string),
    },
    frontUrl: (data?.frontUrl as string) ?? '',
    sideUrl: (data?.sideUrl as string) ?? '',
    backUrl: (data?.backUrl as string) ?? '',
    fullSheetUrl: (data?.fullSheetUrl as string) ?? '',
    palette: (data?.palette as string) ?? '',
    forbiddenTraits: (data?.forbiddenTraits as string) ?? '',
    activeVariant: (data?.activeVariant as CharacterSheetVariant) ?? {
      expressionId: 'calm',
      poseId: 'stand',
      angleId: 'three-quarter',
    },
  };
}

export function syncCharacterSheetNodeOutput(input: CharacterSheetInput) {
  const content = buildCharacterSheetPrompt(input);
  const pictures = collectCharacterSheetPictures(input);
  const ref = pickCharacterSheetReference(input);
  return {
    content,
    output: content,
    meta: buildCharacterSheetMeta(input),
    pictures: pictures.length ? pictures : undefined,
    previewUrl: ref,
    fullSheetUrl: input.fullSheetUrl?.trim() || undefined,
  };
}
