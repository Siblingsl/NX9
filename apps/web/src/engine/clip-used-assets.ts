/**
 * OL-01 / OL-03 / VG-09：视频出片写回 usedAssetIds + 角色 revision pin。
 * flow-runner（级联）与 core-pipeline-runner（批量）共用，保证回流账本口径一致。
 */
import {
  buildCharacterContext,
  characterToItem,
  collectUsedAssetIds,
  soundToItem,
  workspaceItemToAsset,
  type StoryboardShot,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';

export function collectClipUsedAssets(
  prompt: string,
  charCtx: ReturnType<typeof buildCharacterContext>,
  shot?: StoryboardShot | null,
) {
  const doc = useWorkspaceDocument.getState();
  const libraryItems = [
    ...doc.characters.characters.map((c) => characterToItem(c, 'private')),
    ...doc.soundLibrary.sounds.map((s) => soundToItem(s, 'private')),
    ...doc.backlotWorkspace.items.map((i) => workspaceItemToAsset(i, 'private')),
  ];
  const characterRevisions: Record<string, number> = {};
  for (const c of charCtx.characters) {
    characterRevisions[c.id] = c.revision ?? 1;
  }
  const usedAssetIds = collectUsedAssetIds({
    prompt,
    characterIds: charCtx.characters.map((c) => c.id),
    sceneAssetId: shot?.sceneAssetId,
    propIds: shot?.propIds,
    costumeIds: (shot?.costumeOverrides ?? []).map((o) => o.costumeId).filter(Boolean),
    shotAssetId: shot?.shotAssetId,
    libraryItems,
    characterRevisions,
    pinCharacterRevisions: true,
  });
  return {
    usedAssetIds,
    characterRevisionPins: {
      ...(shot?.characterRevisionPins ?? {}),
      ...characterRevisions,
    },
  };
}
