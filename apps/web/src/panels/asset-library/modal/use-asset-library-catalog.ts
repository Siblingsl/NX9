import { useMemo } from 'react';
import type {
  AssetLibraryItem,
  AssetLibraryKind,
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  ShotMoveFamily,
  SoundAssetKind,
  SoundAssetProfile,
  StyleAestheticFamily,
  StylePresetProfile,
  WorkspaceSummary,
} from '@nx9/shared';
import {
  BUILTIN_BACKLOT_TEMPLATES,
  BUILTIN_PUBLIC_SOUND_ASSETS,
  BUILTIN_STYLE_PRESETS,
  getCostumeCreative,
  getEmotionCreative,
  getPropCreative,
  getSceneCreative,
  getShotCreative,
  getVoiceCreative,
  inferSoundAssetKind,
  isSoundFavorite,
  listShotLexiconCategories,
  resolvePublicSounds,
  resolveStylePresets,
} from '@nx9/shared';
import { useAssetLibraryItems } from '../../../hooks/use-asset-library-items';
import { useLibraryAcl } from '../../../engine/use-library-acl';
import { useAssetHealthAnalysis } from '../AssetHealthBar';
import { healthFilterItemIds, type HealthIssueKey } from '../../../engine/asset-library-health';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { useWorkspaceCatalog } from '../../../stores/workspace-catalog';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { BATCHABLE_TABS, ENTITY_CARD_TABS, KIND_META, normalizeName } from './meta';

export type AssetLibraryCatalogDeps = {
  scope: AssetScope;
  tab: AssetLibraryKind;
  editId: string | null;
  query: string;
  favoriteOnly: boolean;
  shotSystemId: string | 'all';
  shotCategory: string | 'all';
  shotMoveFamily: ShotMoveFamily | 'all';
  shotSizeFilter: string | 'all';
  styleFamilyFilter: StyleAestheticFamily | 'all';
  soundKindFilter: SoundAssetKind | 'all';
  healthFilterKey: HealthIssueKey | null;
  showTrash: boolean;
  suggestCreateLabel: string | null;
};

export type AssetLibraryCatalog = {
  activeId: string | null;
  activeProject: WorkspaceSummary | undefined;
  characters: CharacterProfile[];
  workspaceItems: BacklotWorkspaceItem[];
  canRead: boolean;
  canWrite: boolean;
  canDeleteItem: boolean;
  healthAnalysis: ReturnType<typeof useAssetHealthAnalysis>;
  charactersById: Map<string, CharacterProfile>;
  selectedChar: CharacterProfile | undefined;
  selectedSound: SoundAssetProfile | undefined;
  soundsById: Map<string, SoundAssetProfile>;
  selectedStyle: StylePresetProfile | undefined;
  stylesById: Map<string, StylePresetProfile>;
  selectedWorkspaceItem: BacklotWorkspaceItem | undefined;
  costumeBindOptions: Array<{ id: string; label: string; prompt: string }>;
  propBindOptions: Array<{ id: string; label: string; prompt: string }>;
  workspaceById: Map<string, BacklotWorkspaceItem>;
  filtered: AssetLibraryItem[];
  propBoundScenes: Map<string, Array<{ id: string; label: string }>>;
  sceneBindOptions: Array<{ id: string; label: string }>;
  unboundCostumeIds: Set<string>;
  tabMeta: { newLabel: string; emptyHint: string; promptPlaceholder: string };
  characterFullEdit: boolean;
  entityFullEdit: boolean;
  shotFullEdit: boolean;
  styleFullEdit: boolean;
  soundFullEdit: boolean;
  shellFullEdit: boolean;
  canEditPrivate: boolean;
  canEditCurrent: boolean;
  canCreateAsset: boolean;
  suggestCreateExactExists: boolean;
  shotCategoryOptions: string[];
  batchEnabled: boolean;
  selectableBatchIds: string[];
};

export function useAssetLibraryCatalog(deps: AssetLibraryCatalogDeps): AssetLibraryCatalog {
  const {
    scope,
    tab,
    editId,
    query,
    favoriteOnly,
    shotSystemId,
    shotCategory,
    shotMoveFamily,
    shotSizeFilter,
    styleFamilyFilter,
    soundKindFilter,
    healthFilterKey,
    showTrash,
    suggestCreateLabel,
  } = deps;

  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const catalogItems = useWorkspaceCatalog((s) => s.items);
  const acl = useLibraryAcl(scope);
  const { canRead, canWrite, canDelete: canDeleteItem } = acl;

  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const publicCharacters = usePublicAssetLibrary((s) => s.payload.characters);
  const publicSounds = usePublicAssetLibrary((s) => s.payload.sounds);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);
  const publicStyles = usePublicAssetLibrary((s) => s.payload.styles ?? []);
  const { items } = useAssetLibraryItems(scope, tab);

  const activeProject = useMemo(
    () => catalogItems.find((w) => w.id === activeId),
    [catalogItems, activeId],
  );

  const healthAnalysis = useAssetHealthAnalysis(
    characters,
    workspaceItems,
    sounds,
    resolveStylePresets(publicStyles),
  );

  const shotCategoryOptions = useMemo(
    () => listShotLexiconCategories(shotSystemId),
    [shotSystemId],
  );

  const selectedChar = useMemo(
    () =>
      tab === 'character'
        ? (scope === 'private' ? characters : publicCharacters).find((c) => c.id === editId)
        : undefined,
    [tab, scope, characters, publicCharacters, editId],
  );

  const charactersById = useMemo(() => {
    const pool = scope === 'private' ? characters : publicCharacters;
    return new Map(pool.map((c) => [c.id, c]));
  }, [scope, characters, publicCharacters]);

  const selectedSound = useMemo(() => {
    if (tab !== 'sound' || !editId) return undefined;
    if (scope === 'private') return sounds.find((s) => s.id === editId);
    return (
      resolvePublicSounds(publicSounds).find((s) => s.id === editId)
      ?? BUILTIN_PUBLIC_SOUND_ASSETS.find((s) => s.id === editId)
    );
  }, [tab, scope, sounds, publicSounds, editId]);

  const soundsById = useMemo(() => {
    const map = new Map<string, SoundAssetProfile>();
    const pool =
      scope === 'private' ? sounds.filter((s) => !s.deletedAt) : resolvePublicSounds(publicSounds);
    for (const s of pool) map.set(s.id, s);
    return map;
  }, [scope, sounds, publicSounds]);

  const selectedStyle = useMemo(() => {
    if (tab !== 'style') return undefined;
    const pool = resolveStylePresets(publicStyles);
    return pool.find((s) => s.id === editId)
      ?? BUILTIN_STYLE_PRESETS.find((s) => s.id === editId);
  }, [tab, publicStyles, editId]);

  const stylesById = useMemo(() => {
    const map = new Map<string, StylePresetProfile>();
    for (const s of resolveStylePresets(publicStyles)) {
      map.set(s.id, s);
    }
    return map;
  }, [publicStyles]);

  const selectedWorkspaceItem = useMemo((): BacklotWorkspaceItem | undefined => {
    if (tab === 'character' || tab === 'sound' || tab === 'style') return undefined;
    if (scope === 'private') {
      return workspaceItems.find((i) => i.id === editId && i.kind === tab);
    }
    const tpl =
      publicTemplates.find((x) => x.id === editId && x.kind === tab)
      ?? BUILTIN_BACKLOT_TEMPLATES.find((x) => x.id === editId && x.kind === tab);
    if (!tpl || tpl.kind === 'character') return undefined;
    // 只读预览内置/公共模板；要编辑请点「导入」
    return {
      id: tpl.id,
      kind: tpl.kind as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>,
      label: tpl.label,
      promptEn: tpl.promptEn,
      promptZh: tpl.promptZh,
      hookPhase: tpl.hookPhase,
      creative: 'creative' in tpl ? tpl.creative : undefined,
      sourceTemplateId: tpl.id,
    };
  }, [tab, scope, workspaceItems, publicTemplates, editId]);

  const costumeBindOptions = useMemo(() => {
    const privateCostumes = workspaceItems
      .filter((i) => i.kind === 'costume')
      .map((i) => ({
        id: i.id,
        label: i.label,
        prompt: i.promptEn || i.promptZh || '',
      }));
    const publicCostumes = [
      ...publicTemplates.filter((x) => x.kind === 'costume'),
      ...BUILTIN_BACKLOT_TEMPLATES.filter((x) => x.kind === 'costume'),
    ].map((i) => ({
      id: i.id,
      label: i.label,
      prompt: i.promptEn || i.promptZh || '',
    }));
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string; prompt: string }> = [];
    for (const row of [...privateCostumes, ...publicCostumes]) {
      const key = row.id || row.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [workspaceItems, publicTemplates]);

  const propBindOptions = useMemo(
    () =>
      workspaceItems
        .filter((i) => i.kind === 'prop')
        .map((i) => ({
          id: i.id,
          label: i.label,
          prompt: i.promptEn || getPropCreative(i).description || '',
        })),
    [workspaceItems],
  );

  const workspaceById = useMemo(() => {
    const map = new Map<string, BacklotWorkspaceItem>();
    for (const item of workspaceItems) map.set(item.id, item);
    if (scope === 'public') {
      for (const tpl of [...publicTemplates, ...BUILTIN_BACKLOT_TEMPLATES]) {
        if (tpl.kind === 'character') continue;
        if (map.has(tpl.id)) continue;
        map.set(tpl.id, {
          id: tpl.id,
          kind: tpl.kind as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>,
          label: tpl.label,
          promptEn: tpl.promptEn,
          promptZh: tpl.promptZh,
          hookPhase: tpl.hookPhase,
          creative: 'creative' in tpl ? tpl.creative : undefined,
          sourceTemplateId: tpl.id,
        });
      }
    }
    return map;
  }, [workspaceItems, scope, publicTemplates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const healthIds = healthFilterItemIds(healthAnalysis, tab, healthFilterKey);
    return items.filter((i) => {
      if (healthIds && !healthIds.has(i.id)) return false;
      if (tab === 'shot') {
        const ws =
          workspaceById.get(i.id)
          ?? ({ id: i.id, kind: 'shot' as const, label: i.label, promptEn: i.prompt });
        const ext = getShotCreative(ws);
        if (favoriteOnly && !ext.favorite) return false;
        if (shotSystemId !== 'all' && ext.lexiconSystemId !== shotSystemId) return false;
        if (shotCategory !== 'all' && ext.lexiconCategory !== shotCategory) return false;
        if (shotMoveFamily !== 'all' && ext.moveFamily !== shotMoveFamily) return false;
        if (shotSizeFilter !== 'all' && !(ext.shotSize ?? '').includes(shotSizeFilter)) return false;
        if (q) {
          const hay = [
            i.label,
            i.prompt,
            i.description,
            ext.purpose,
            ext.cameraMove,
            ext.shotSize,
            ext.lexiconSystem,
            ext.lexiconCategory,
            ...(i.tags ?? []),
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }
      if (tab === 'style') {
        const style = stylesById.get(i.id);
        if (favoriteOnly && !style?.favorite) return false;
        if (styleFamilyFilter !== 'all' && style?.family !== styleFamilyFilter) return false;
        if (q) {
          const hay = [
            i.label,
            i.prompt,
            i.description,
            style?.promptZh,
            style?.promptEn,
            style?.family,
            ...(style?.tags ?? []),
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }
      if (tab === 'sound') {
        const sound = soundsById.get(i.id);
        if (favoriteOnly && !isSoundFavorite(sound)) return false;
        if (soundKindFilter !== 'all') {
          const kind = sound ? inferSoundAssetKind(sound) : undefined;
          if (kind !== soundKindFilter) return false;
        }
        if (q) {
          const ext = sound ? getVoiceCreative(sound) : {};
          const hay = [
            i.label,
            i.prompt,
            i.description,
            sound?.soundKind,
            ext.voiceTone,
            ext.emotion,
            ...(sound?.tags ?? i.tags ?? []),
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }
      if (favoriteOnly && tab === 'emotion') {
        const ws = workspaceItems.find((w) => w.id === i.id);
        const fav = getEmotionCreative(
          ws ?? { id: i.id, kind: 'emotion', label: i.label, promptEn: '' },
        ).favorite;
        if (!fav) return false;
      }
      if (!q) return true;
      return (
        i.label.toLowerCase().includes(q)
        || i.prompt.toLowerCase().includes(q)
        || (i.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    items,
    query,
    healthAnalysis,
    tab,
    healthFilterKey,
    favoriteOnly,
    workspaceItems,
    workspaceById,
    stylesById,
    soundsById,
    shotSystemId,
    shotCategory,
    shotMoveFamily,
    shotSizeFilter,
    styleFamilyFilter,
    soundKindFilter,
  ]);

  const propBoundScenes = useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string }>>();
    const push = (propId: string, scene: { id: string; label: string }) => {
      const cur = map.get(propId) ?? [];
      if (cur.some((s) => s.id === scene.id)) return;
      map.set(propId, [...cur, scene]);
    };
    for (const scene of workspaceItems.filter((i) => i.kind === 'scene')) {
      for (const propId of getSceneCreative(scene).propIds ?? []) {
        if (propId) push(propId, { id: scene.id, label: scene.label });
      }
    }
    for (const prop of workspaceItems.filter((i) => i.kind === 'prop')) {
      for (const sceneId of getPropCreative(prop).linkedSceneIds ?? []) {
        const scene = workspaceItems.find((w) => w.id === sceneId && w.kind === 'scene');
        if (scene) push(prop.id, { id: scene.id, label: scene.label });
      }
    }
    return map;
  }, [workspaceItems]);

  const sceneBindOptions = useMemo(
    () =>
      workspaceItems
        .filter((i) => i.kind === 'scene')
        .map((i) => ({ id: i.id, label: i.label })),
    [workspaceItems],
  );

  const unboundCostumeIds = useMemo(() => {
    const bound = new Set(healthAnalysis.costumeBoundCharacters.keys());
    return new Set(
      workspaceItems.filter((i) => i.kind === 'costume' && !bound.has(i.id)).map((i) => i.id),
    );
  }, [workspaceItems, healthAnalysis.costumeBoundCharacters]);

  const tabMeta = KIND_META[tab];
  const characterFullEdit = tab === 'character' && Boolean(selectedChar);
  const entityFullEdit =
    ENTITY_CARD_TABS.has(tab) && Boolean(selectedWorkspaceItem);
  const shotFullEdit = tab === 'shot' && Boolean(selectedWorkspaceItem);
  const styleFullEdit = tab === 'style' && Boolean(selectedStyle);
  const soundFullEdit = tab === 'sound' && Boolean(selectedSound);
  const shellFullEdit =
    characterFullEdit || entityFullEdit || shotFullEdit || styleFullEdit || soundFullEdit;
  const canEditPrivate = (scope !== 'private' || Boolean(activeId)) && canWrite;
  /** 当前 scope 下可写（公共需 allowPublicWrite；私有需打开项目） */
  const canEditCurrent = canWrite && (scope === 'public' || canEditPrivate);
  const canCreateAsset =
    canEditCurrent
    && tab !== 'hook'
    && tab !== 'emotion';

  const suggestCreateExactExists = useMemo(() => {
    if (!suggestCreateLabel) return false;
    const needle = suggestCreateLabel.trim().toLowerCase();
    return items.some((i) => i.label.trim().toLowerCase() === needle);
  }, [suggestCreateLabel, items]);

  const batchEnabled =
    BATCHABLE_TABS.has(tab)
    && !editId
    && !showTrash
    && canEditCurrent;

  const selectableBatchIds = useMemo(() => {
    if (!batchEnabled) return [] as string[];
    return filtered.filter((i) => !i.builtin).map((i) => i.id);
  }, [batchEnabled, filtered]);

  return {
    activeId,
    activeProject,
    characters,
    workspaceItems,
    canRead,
    canWrite,
    canDeleteItem,
    healthAnalysis,
    charactersById,
    selectedChar,
    selectedSound,
    soundsById,
    selectedStyle,
    stylesById,
    selectedWorkspaceItem,
    costumeBindOptions,
    propBindOptions,
    workspaceById,
    filtered,
    propBoundScenes,
    sceneBindOptions,
    unboundCostumeIds,
    tabMeta,
    characterFullEdit,
    entityFullEdit,
    shotFullEdit,
    styleFullEdit,
    soundFullEdit,
    shellFullEdit,
    canEditPrivate,
    canEditCurrent,
    canCreateAsset,
    suggestCreateExactExists,
    shotCategoryOptions,
    batchEnabled,
    selectableBatchIds,
  };
}
