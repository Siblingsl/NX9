import type { StoryboardShot } from '../types/storyboard';

export const SCLASS_MAX_DURATION_SEC = 15;
export const SCLASS_MAX_REF_IMAGES = 9;
export const SCLASS_MAX_REF_VIDEOS = 3;

export interface SClassGroup {
  id: string;
  name: string;
  shotIds: string[];
  totalDurationSec: number;
  overLimit: boolean;
}

export interface SClassCompileResult {
  groups: SClassGroup[];
  prompt: string;
  warnings: string[];
}

function genGroupId(): string {
  return `sclass-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 贪心分组：单组累计时长 ≤ maxDurationSec（Seedance S-Class ≤15s 约束） */
export function groupSClassShots(
  shots: StoryboardShot[],
  maxDurationSec: number = SCLASS_MAX_DURATION_SEC,
): SClassGroup[] {
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) return [];

  const groups: SClassGroup[] = [];
  let currentIds: string[] = [];
  let currentDuration = 0;

  const flush = () => {
    if (currentIds.length === 0) return;
    const first = ordered.find((s) => s.id === currentIds[0]);
    const last = ordered.find((s) => s.id === currentIds[currentIds.length - 1]);
    const name =
      first && last
        ? first.id === last.id
          ? `S-Class #${first.index}`
          : `S-Class #${first.index}–#${last.index}`
        : `S-Class ${groups.length + 1}`;
    groups.push({
      id: genGroupId(),
      name,
      shotIds: [...currentIds],
      totalDurationSec: currentDuration,
      overLimit: currentDuration > maxDurationSec,
    });
    currentIds = [];
    currentDuration = 0;
  };

  for (const shot of ordered) {
    const dur = Math.max(1, shot.durationSec || 4);
    if (currentIds.length > 0 && currentDuration + dur > maxDurationSec) {
      flush();
    }
    currentIds.push(shot.id);
    currentDuration += dur;
  }
  flush();
  return groups;
}

/** Seedance 参考约束：≤9 张图 / ≤3 段视频。返回错误文案，合规返回 null */
export function validateSClassReferences(
  imageCount: number,
  videoCount: number,
): string | null {
  if (imageCount > SCLASS_MAX_REF_IMAGES) {
    return `参考图 ${imageCount} 张超出 Seedance S-Class 上限（≤${SCLASS_MAX_REF_IMAGES} 张），请删减后再生成`;
  }
  if (videoCount > SCLASS_MAX_REF_VIDEOS) {
    return `参考视频 ${videoCount} 段超出 Seedance S-Class 上限（≤${SCLASS_MAX_REF_VIDEOS} 段），请删减后再生成`;
  }
  return null;
}

/** 将一组镜头编译为合规 Seedance 连续镜头 Prompt */
export function compileSClassPrompt(
  group: SClassGroup,
  shots: StoryboardShot[],
  opts: { referenceImages?: string[]; referenceVideos?: string[] } = {},
): SClassCompileResult {
  const members = group.shotIds
    .map((id) => shots.find((s) => s.id === id))
    .filter((s): s is StoryboardShot => Boolean(s));

  const warnings: string[] = [];
  if (group.overLimit) {
    warnings.push(`本组累计 ${group.totalDurationSec}s 超过 ≤${SCLASS_MAX_DURATION_SEC}s 约束，Seedance 可能截断或部分重生成`);
  }

  const imageCount = opts.referenceImages?.length ?? 0;
  const videoCount = opts.referenceVideos?.length ?? 0;
  const refError = validateSClassReferences(imageCount, videoCount);
  if (refError) warnings.push(refError);

  const lines = members.map((s, i) => {
    const cue = `${i + 1}. [${s.durationSec}s ${s.shotType}] ${s.videoPromptEn || s.promptEn || s.descriptionZh}`;
    return cue;
  });

  const refNote =
    imageCount > 0 || videoCount > 0
      ? `\n参考：${imageCount} 张图 / ${videoCount} 段视频（≤${SCLASS_MAX_REF_IMAGES} 图 / ≤${SCLASS_MAX_REF_VIDEOS} 视频）`
      : '';

  const prompt = `Seedance S-Class 连续镜头（${group.totalDurationSec}s）:\n${lines.join('\n')}${refNote}`;

  return { groups: [group], prompt, warnings };
}
