import { useMemo } from 'react';
import type { AssetLibraryItem, AssetLibraryKind, AssetScope } from '@nx9/shared';
import {
  BUILTIN_BACKLOT_TEMPLATES,
  BUILTIN_PUBLIC_SOUND_ASSETS,
  characterToItem,
  isAssetActive,
  listBacklotTemplates,
  soundToItem,
  templateToAsset,
  workspaceItemToAsset,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { usePublicAssetLibrary } from '../stores/public-asset-library';

export function useAssetLibraryItems(scope: AssetScope, kind?: AssetLibraryKind) {
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const backlotCustom = useWorkspaceDocument((s) => s.backlotCustom.items);
  const backlotWorkspace = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const publicPayload = usePublicAssetLibrary((s) => s.payload);

  return useMemo(() => {
    const privateItems: AssetLibraryItem[] = [];
    const publicItems: AssetLibraryItem[] = [];

    for (const c of characters) {
      if (!isAssetActive(c)) continue;
      privateItems.push(characterToItem(c, 'private'));
    }
    for (const s of sounds) {
      if (!isAssetActive(s)) continue;
      privateItems.push(soundToItem(s, 'private'));
    }
    for (const ws of backlotWorkspace) {
      if (!isAssetActive(ws)) continue;
      privateItems.push(workspaceItemToAsset(ws, 'private'));
    }
    for (const tpl of listBacklotTemplates('character', backlotCustom)) {
      if ('createdAt' in tpl) {
        if (!isAssetActive(tpl)) continue;
        privateItems.push(templateToAsset(tpl, 'private'));
      }
    }
    for (const kindKey of ['costume', 'scene', 'shot', 'emotion', 'hook'] as const) {
      for (const tpl of listBacklotTemplates(kindKey, backlotCustom)) {
        if ('createdAt' in tpl) {
          if (!isAssetActive(tpl)) continue;
          privateItems.push(templateToAsset(tpl, 'private'));
        }
      }
    }

    for (const c of publicPayload.characters) {
      if (!isAssetActive(c)) continue;
      publicItems.push(characterToItem(c, 'public'));
    }
    for (const s of publicPayload.sounds) {
      if (!isAssetActive(s)) continue;
      publicItems.push(soundToItem(s, 'public'));
    }
    for (const s of BUILTIN_PUBLIC_SOUND_ASSETS) {
      publicItems.push({ ...soundToItem(s, 'public'), builtin: true });
    }
    for (const tpl of publicPayload.templates) {
      if (!isAssetActive(tpl)) continue;
      publicItems.push(templateToAsset(tpl, 'public'));
    }
    for (const tpl of BUILTIN_BACKLOT_TEMPLATES) {
      publicItems.push(templateToAsset(tpl as any, 'public', true));
    }

    const pool = scope === 'private' ? privateItems : publicItems;
    if (!kind) return { items: pool, privateItems, publicItems };
    return {
      items: pool.filter((i) => i.kind === kind),
      privateItems: privateItems.filter((i) => i.kind === kind),
      publicItems: publicItems.filter((i) => i.kind === kind),
    };
  }, [characters, sounds, backlotCustom, backlotWorkspace, publicPayload, scope, kind]);
}

export function useAllAssetLibraryItems(kind?: AssetLibraryKind) {
  const privatePool = useAssetLibraryItems('private');
  const publicPool = useAssetLibraryItems('public');
  return useMemo(() => {
    const privateItems = kind
      ? privatePool.privateItems.filter((i) => i.kind === kind)
      : privatePool.privateItems;
    const publicItems = kind
      ? publicPool.publicItems.filter((i) => i.kind === kind)
      : publicPool.publicItems;
    return {
      privateItems,
      publicItems,
      allItems: [...privateItems, ...publicItems],
    };
  }, [privatePool.privateItems, publicPool.publicItems, kind]);
}
