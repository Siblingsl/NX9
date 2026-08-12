import { useMemo } from 'react';
import type { AssetLibraryItem, AssetLibraryKind, AssetScope } from '@nx9/shared';
import {
  BUILTIN_BACKLOT_TEMPLATES,
  BUILTIN_PUBLIC_SOUND_ASSETS,
  BUILTIN_STYLE_PRESETS,
  characterToItem,
  isAssetActive,
  listBacklotTemplates,
  resolvePublicSounds,
  resolveStylePresets,
  soundToItem,
  styleToItem,
  templateToAsset,
  workspaceItemToAsset,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { usePublicAssetLibrary } from '../stores/public-asset-library';

function nameKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function useAssetLibraryItems(scope: AssetScope, kind?: AssetLibraryKind) {
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const backlotCustom = useWorkspaceDocument((s) => s.backlotCustom.items);
  const backlotWorkspace = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const publicPayload = usePublicAssetLibrary((s) => s.payload);

  return useMemo(() => {
    const privateItems: AssetLibraryItem[] = [];
    const publicItems: AssetLibraryItem[] = [];
    const builtinSoundNames = new Set(
      BUILTIN_PUBLIC_SOUND_ASSETS.map((b) => nameKey(b.name)).filter(Boolean),
    );
    const builtinStyleNames = new Set(
      BUILTIN_STYLE_PRESETS.map((b) => nameKey(b.name)).filter(Boolean),
    );

    for (const c of characters) {
      if (!isAssetActive(c)) continue;
      privateItems.push(characterToItem(c, 'private'));
    }
    for (const s of sounds) {
      if (!isAssetActive(s)) continue;
      privateItems.push(soundToItem(s, 'private'));
    }
    // 风格 / 镜头词典只在公共库维护；私有列表不挂 style（遗留 project styleLibrary 仍可供帧解析兼容）
    for (const ws of backlotWorkspace) {
      if (!isAssetActive(ws)) continue;
      if (ws.kind === 'shot' || ws.kind === 'emotion' || ws.kind === 'hook') continue;
      privateItems.push(workspaceItemToAsset(ws, 'private'));
    }
    for (const tpl of listBacklotTemplates('character', backlotCustom)) {
      if ('createdAt' in tpl) {
        if (!isAssetActive(tpl)) continue;
        privateItems.push(templateToAsset(tpl, 'private'));
      }
    }
    for (const kindKey of ['costume', 'scene', 'prop'] as const) {
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
    for (const s of resolvePublicSounds(publicPayload.sounds)) {
      const builtin = Boolean(s.builtinKey) || s.id.startsWith('builtin-sound-');
      publicItems.push({
        ...soundToItem(s, 'public'),
        builtin,
        overridesBuiltin: !builtin && builtinSoundNames.has(nameKey(s.name)),
      });
    }
    for (const s of resolveStylePresets(publicPayload.styles ?? [])) {
      const builtin = Boolean(s.builtinKey);
      publicItems.push({
        ...styleToItem(s, 'public'),
        builtin,
        overridesBuiltin: !builtin && builtinStyleNames.has(nameKey(s.name)),
      });
    }
    for (const tpl of publicPayload.templates) {
      if (!isAssetActive(tpl)) continue;
      publicItems.push(templateToAsset(tpl, 'public'));
    }
    const publicTemplateIds = new Set(publicPayload.templates.map((t) => t.id));
    for (const tpl of BUILTIN_BACKLOT_TEMPLATES) {
      if (publicTemplateIds.has(tpl.id)) continue;
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
