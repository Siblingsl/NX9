import type { BacklotWorkspaceItem, CharacterProfile, EnvironmentProfile } from '@nx9/shared';
import {
  migrateEnvironmentProfile,
  newBacklotWorkspaceItem,
  refreshWorkspacePrompts,
} from '@nx9/shared';

export function scriptCandidateCharacterKeys(character: CharacterProfile): string[] {
  return [
    character.name,
    character.creative?.nickname,
    ...(character.creative?.aliases ?? []),
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

export function buildCharacterCandidatePrompt(character: CharacterProfile): string {
  return [
    `角色名称：${character.name}`,
    character.bible?.identity ? `身份：${character.bible.identity}` : '',
    character.descriptionZh ? `描述：${character.descriptionZh}` : '',
    character.bible?.appearance ? `固定外貌：${character.bible.appearance}` : '',
    character.bible?.personality ? `性格/表演：${character.bible.personality}` : '',
    character.bible?.relationships ? `人物关系：${character.bible.relationships}` : '',
    character.consistencyPrompt ? `一致性 Prompt：${character.consistencyPrompt}` : '',
    character.creative?.aliases?.length ? `别名/称呼：${character.creative.aliases.join('、')}` : '',
    '用途：保存到素材库角色页后，供分镜、图像生成、视频生成、3D 摆位统一 @引用。',
  ].filter(Boolean).join('\n');
}

export function buildSceneCandidatePrompt(scene: EnvironmentProfile): string {
  return [
    `场景名称：${scene.name}`,
    scene.sceneCode ? `场景码：${scene.sceneCode}` : '',
    scene.descriptionZh ? `空间锚点：${scene.descriptionZh}` : '',
    scene.era ? `时代/地域：${scene.era}` : '',
    scene.lighting ? `光线/时间：${scene.lighting}` : '',
    scene.props?.length ? `固定道具/结构：${scene.props.join('、')}` : '',
    scene.consistencyPrompt ? `一致性 Prompt：${scene.consistencyPrompt}` : '',
    '用途：保存到素材库场景页后，供分镜、图像生成、视频生成、3D 导演台统一 @引用。',
  ].filter(Boolean).join('\n');
}

export function sceneCandidateToWorkspaceItem(
  scene: EnvironmentProfile,
  existing?: BacklotWorkspaceItem,
): BacklotWorkspaceItem {
  const lightingParts = (scene.lighting ?? '').split(/[·,，]/).map((s) => s.trim()).filter(Boolean);
  return refreshWorkspacePrompts({
    ...(existing ?? newBacklotWorkspaceItem('scene')),
    id: existing?.id ?? `scene-${scene.id}`,
    kind: 'scene',
    label: scene.name,
    promptZh: scene.descriptionZh ?? '',
    promptEn: scene.consistencyPrompt ?? scene.descriptionZh ?? scene.name,
    creative: {
      ...(existing?.creative ?? {}),
      environmentId: scene.id,
      sceneCode: scene.sceneCode,
      description: scene.descriptionZh,
      timeOfDay: scene.era ?? lightingParts[1],
      lighting: lightingParts[0] ?? scene.lighting,
      weather: lightingParts[1],
      colorTone: lightingParts[2],
      props: scene.props ?? [],
      referenceUrls: scene.referenceUrls ?? (scene.referenceImageUrl ? [scene.referenceImageUrl] : []),
      tags: ['script-breakdown', 'scene-consistency'],
      locked: true,
    } as unknown as BacklotWorkspaceItem['creative'],
  });
}

/** 素材库场景条目 → 环境圣经（Playbook / flow-runner / 导演台 SSOT） */
export function workspaceItemToEnvironmentProfile(
  item: BacklotWorkspaceItem,
  existing?: EnvironmentProfile,
): EnvironmentProfile {
  const creative = (item.creative ?? {}) as Record<string, unknown>;
  const refs = Array.isArray(creative.referenceUrls)
    ? (creative.referenceUrls.filter(Boolean) as string[])
    : [];
  const sheetUrl = typeof creative.sheetUrl === 'string' ? creative.sheetUrl.trim() : '';
  if (sheetUrl && !refs.includes(sheetUrl)) refs.unshift(sheetUrl);

  const envId =
    (typeof creative.environmentId === 'string' && creative.environmentId.trim())
    || existing?.id
    || (item.id.startsWith('scene-') ? item.id.slice('scene-'.length) : `env-${item.id}`);

  const lighting = [creative.lighting, creative.weather, creative.colorTone]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' · ');

  const prompts = creative.prompts as { scene?: { text?: string }; negative?: { text?: string } } | undefined;
  const props = Array.isArray(creative.props)
    ? (creative.props.filter((p): p is string => typeof p === 'string' && Boolean(p.trim())) as string[])
    : existing?.props;

  return migrateEnvironmentProfile({
    id: envId,
    sceneCode:
      (typeof creative.sceneCode === 'string' && creative.sceneCode.trim())
      || existing?.sceneCode,
    name: item.label,
    descriptionZh:
      (typeof creative.description === 'string' && creative.description.trim())
      || item.promptZh
      || existing?.descriptionZh
      || '',
    consistencyPrompt:
      item.promptEn?.trim()
      || prompts?.scene?.text?.trim()
      || existing?.consistencyPrompt,
    era:
      (typeof creative.timeOfDay === 'string' && creative.timeOfDay.trim())
      || (typeof creative.worldView === 'string' && creative.worldView.trim())
      || existing?.era,
    lighting: lighting || (typeof creative.lighting === 'string' ? creative.lighting : undefined) || existing?.lighting,
    props,
    referenceUrls: refs,
    referenceImageUrl: refs[0] ?? null,
    hdriUrl: existing?.hdriUrl ?? null,
    meshUrl: existing?.meshUrl ?? null,
  });
}

export async function copyTextWithLog(
  text: string,
  appendLog: (message: string) => void,
  successMessage = '已复制候选设定 Prompt',
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    appendLog(successMessage);
  } catch {
    appendLog('复制失败：浏览器未授权剪贴板，请手动选中文本复制。');
  }
}
