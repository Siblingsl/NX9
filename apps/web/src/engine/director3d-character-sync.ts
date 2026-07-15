import type { CharacterProfile, StoryboardDirectorCharacterPlacement } from '@nx9/shared';
import type { DirectorObject, DirectorProject } from '@nx9/director3d';

const COLORS = ['#5E4D8A', '#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED'];

function safeObjectId(characterId: string): string {
  return `shot-char-${encodeURIComponent(characterId).replace(/%/g, '')}`;
}

/** 把当前分镜角色带入全景场景；已有摆位优先恢复，其他镜头角色仅隐藏不删除。 */
export function prepareDirectorProjectForShot(
  project: DirectorProject,
  characterIds: string[] | undefined,
  characters: CharacterProfile[],
  placements?: StoryboardDirectorCharacterPlacement[],
  characterNames?: string[],
): DirectorProject {
  const ids = [...new Set(characterIds ?? [])];
  for (const name of characterNames ?? []) {
    const profile = characters.find((item) => item.name === name);
    const id = profile?.id ?? `unbound-name-${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '-')}`;
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0 && !placements?.length) return project;

  const placementByCharacter = new Map(
    (placements ?? []).filter((item) => item.characterId).map((item) => [item.characterId!, item]),
  );
  const required = new Set(ids.length ? ids : [...placementByCharacter.keys()]);
  const requiredIds = [...required];
  const objects = project.objects.map((object) =>
    object.kind === 'character' && object.sourceCharacterId
      ? { ...object, visible: required.has(object.sourceCharacterId) }
      : object,
  );

  for (let index = 0; index < requiredIds.length; index++) {
    const characterId = requiredIds[index];
    const profile = characters.find((item) => item.id === characterId);
    const fallbackName = characterId.startsWith('unbound-name-')
      ? characterId.slice('unbound-name-'.length)
      : undefined;
    const placement = placementByCharacter.get(characterId);
    const existingIndex = objects.findIndex(
      (item) => item.sourceCharacterId === characterId || (
        (!item.sourceCharacterId || item.sourceCharacterId.startsWith('unbound-name-')) &&
        item.name === (profile?.name ?? fallbackName)
      ),
    );
    const fallbackX = (index - (requiredIds.length - 1) / 2) * 1.25;
    const transform = placement
      ? {
          position: placement.position,
          rotation: placement.rotation,
          scale: placement.scale,
        }
      : { position: [fallbackX, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] };

    if (existingIndex >= 0) {
      const existing = objects[existingIndex];
      objects[existingIndex] = {
        ...existing,
        name: profile?.name || placement?.name || fallbackName || existing.name,
        sourceCharacterId: characterId,
        visible: true,
        transform,
        bodyType: (placement?.bodyType as DirectorObject['bodyType']) ?? existing.bodyType ?? 'neutral',
        posePresetId: placement?.posePresetId ?? existing.posePresetId ?? 'stand',
      };
      continue;
    }

    objects.push({
      id: placement?.objectId || safeObjectId(characterId),
      name: profile?.name || placement?.name || fallbackName || `角色 ${index + 1}`,
      kind: 'character',
      sourceCharacterId: characterId,
      visible: true,
      locked: false,
      color: COLORS[index % COLORS.length],
      bodyType: (placement?.bodyType as DirectorObject['bodyType']) ?? 'neutral',
      posePresetId: placement?.posePresetId ?? 'stand',
      transform,
    });
  }

  return { ...project, objects };
}

export function extractDirectorCharacterPlacements(
  project: DirectorProject,
): StoryboardDirectorCharacterPlacement[] {
  return project.objects
    .filter((object) => object.kind === 'character' && object.visible)
    .map((object) => ({
      objectId: object.id,
      characterId: object.sourceCharacterId,
      name: object.name,
      position: object.transform.position,
      rotation: object.transform.rotation,
      scale: object.transform.scale,
      bodyType: object.bodyType,
      posePresetId: object.posePresetId,
    }));
}
