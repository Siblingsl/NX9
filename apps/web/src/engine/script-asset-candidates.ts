import type { BacklotWorkspaceItem, CharacterProfile, EnvironmentProfile } from '@nx9/shared';
import { newBacklotWorkspaceItem, refreshWorkspacePrompts } from '@nx9/shared';

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
    '用途：复制到角色设定节点，或保存到角色库后供分镜、图像生成、视频生成、3D 摆位统一引用。',
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
    '用途：复制到场景设定节点，或保存到场景库后供分镜、图像生成、视频生成、3D 导演台统一引用。',
  ].filter(Boolean).join('\n');
}

export function sceneCandidateToWorkspaceItem(
  scene: EnvironmentProfile,
  existing?: BacklotWorkspaceItem,
): BacklotWorkspaceItem {
  return refreshWorkspacePrompts({
    ...(existing ?? newBacklotWorkspaceItem('scene')),
    id: existing?.id ?? `scene-${scene.id}`,
    kind: 'scene',
    label: scene.name,
    promptZh: scene.descriptionZh ?? '',
    promptEn: scene.consistencyPrompt ?? scene.descriptionZh ?? scene.name,
    creative: {
      ...(existing?.creative ?? {}),
      description: scene.descriptionZh,
      timeOfDay: scene.era,
      lighting: scene.lighting,
      referenceUrls: scene.referenceUrls ?? [],
      tags: ['script-breakdown', 'scene-consistency'],
      locked: true,
    } as unknown as BacklotWorkspaceItem['creative'],
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
