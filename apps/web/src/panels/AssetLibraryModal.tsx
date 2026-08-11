import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AssetLibraryKind,
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  ASSET_LIBRARY_TABS,
  assetLibraryTabGroupsForScope,
  isAssetLibraryPublicOnlyKind,
  BUILTIN_BACKLOT_TEMPLATES,
  MAX_ENV_REFERENCE_IMAGES,
  newBacklotWorkspaceItem,
  newCharacterProfile,
  newSoundAsset,
  newStylePreset,
  cloneStylePreset,
  cloneSoundAsset,
  normalizeCharacterProfile,
  refreshCharacterPrompts,
  refreshVoicePrompts,
  refreshWorkspacePrompts,
  templateToWorkspaceItem,
  workspaceItemToCustomTemplate,
  buildCostumeSheetGenerationPrompt,
  buildCharacterSheetGenerationPrompt,
  buildSceneSheetGenerationPrompt,
  buildPropSheetGenerationPrompt,
  applyCroppedPanelsToCharacter,
  CHARACTER_SHEET_CATEGORY_LAYOUTS,
  CHARACTER_SHEET_CANVAS_WIDTH,
  CHARACTER_SHEET_CANVAS_HEIGHT,
  getSceneCreative,
  getCostumeCreative,
  getPropCreative,
  getShotCreative,
  getEmotionCreative,
  getCharacterCreative,
  getVoiceCreative,
  CAC_SHOT_SIZES,
  formatAssetMention,
  resolveStylePresets,
  resolvePublicSounds,
  BUILTIN_STYLE_PRESETS,
  BUILTIN_PUBLIC_SOUND_ASSETS,
  STYLE_AESTHETIC_FAMILIES,
  SOUND_ASSET_KINDS,
  isBuiltinStylePreset,
  isBuiltinSoundAsset,
  isSoundFavorite,
  inferSoundAssetKind,
  SHOT_MOVE_FAMILIES,
  SHOT_LEXICON_SYSTEMS,
  listShotLexiconCategories,
  shortenShotLexiconCategory,
  type EntitySheetCropKind,
  type ShotMoveFamily,
  type StyleAestheticFamily,
  type StylePresetProfile,
  type SoundAssetKind,
} from '@nx9/shared';import {
  sceneCandidateToWorkspaceItem,
  workspaceItemToEnvironmentProfile,
} from '../engine/script-asset-candidates';
import {
  Globe2,
  FolderLock,
  Layers,
  Plus,
  Sparkles,
  Loader2,
  Search,
  Trash2,
  X,
  ChevronLeft,
} from 'lucide-react';
import { api } from '../api/client';
import { useAssetLibraryItems } from '../hooks/use-asset-library-items';
import { useAssetLibraryModalUi } from '../stores/asset-library-modal-ui';
import { usePublicAssetLibrary } from '../stores/public-asset-library';
import { useWorkspaceCatalog } from '../stores/workspace-catalog';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useActivityLog } from '../stores/activity-log';
import { toastError, toastSuccess } from '../stores/toast';
import { confirmDelete } from '../stores/confirm-dialog';
import { useAssetLibraryGenSettings } from '../stores/asset-library-gen-settings';
import AssetLibraryGenSettings, { resolveAssetLibraryImageRequest } from './asset-library/AssetLibraryGenSettings';
import { useLibraryAcl } from '../engine/use-library-acl';
import { getGenPack } from '../engine/gen-skill-runtime';
import { runPictureGenJob } from '../engine/picture-gen-runner';
import { cropCharacterSheetPanels } from '../engine/character-sheet-crop';
import { cropEntitySheetPanel } from '../engine/entity-sheet-crop';
import { AssetTrashPanel } from './AssetTrashPanel';
import {
  CharacterDetailFields,
  CostumeDetailFields,
  PropDetailFields,
  SceneDetailFields,
  ShotDetailFields,
  EmotionDetailFields,
  VoiceDetailFields,
  StyleDetailFields,
} from './asset-library/AssetDetailFields';
import { AssetHealthBar, useAssetHealthAnalysis } from './asset-library/AssetHealthBar';
import { CharacterCardGrid } from './asset-library/CharacterCardGrid';
import { EntityCardGrid, type EntityCardKind } from './asset-library/EntityCardGrid';
import { ShotCardGrid } from './asset-library/ShotCardGrid';
import { StyleCardGrid } from './asset-library/StyleCardGrid';
import { SoundCardGrid } from './asset-library/SoundCardGrid';import { ShotFilterChipScroller } from './asset-library/ShotFilterChipScroller';
import {
  healthFilterItemIds,
  type HealthIssueKey,
} from '../engine/asset-library-health';

const ENTITY_CARD_TABS = new Set<AssetLibraryKind>(['costume', 'scene', 'prop']);

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const KIND_META: Record<
  AssetLibraryKind,
  { newLabel: string; emptyHint: string; promptPlaceholder: string }
> = {
  character: {
    newLabel: '新建角色',
    emptyHint: '角色设定主入口：档案、三视图、设定板生成；可在生成节点 @角色 引用',
    promptPlaceholder: '一致性 prompt…',
  },
  costume: {
    newLabel: '新建服装',
    emptyHint: '创建服装套装，维护面料/配色/标志物，可在生成节点 @服装 引用',
    promptPlaceholder: '造型、面料、配色、标志物…',
  },
  scene: {
    newLabel: '新建场景',
    emptyHint: '场景设定主入口：空间锚点、多参考图、环境圣经同步；可在生成节点 @场景 引用',
    promptPlaceholder: '环境、光线、空间描述…',
  },
  prop: {
    newLabel: '新建道具',
    emptyHint: '创建道具档案，维护外观 Prompt 与参考图；可在生成节点 @道具 引用',
    promptPlaceholder: '外形、材质、标志细节…',
  },
  shot: {
    newLabel: '新建镜头',
    emptyHint: '公共运镜词典为空 · 可新建条目，或检查筛选条件',
    promptPlaceholder: '运镜、景别、机位描述…',
  },
  emotion: {
    newLabel: '（已停用新建）',
    emptyHint: '情绪库已降级：请用镜头「推荐情绪」标签，或角色表情格。此处仅兼容旧条目。',
    promptPlaceholder: '表情、氛围…',
  },
  hook: {
    newLabel: '（已停用新建）',
    emptyHint: '爆点已退出素材库：请在编剧台维护 brief.hooks。此处仅兼容旧条目。',
    promptPlaceholder: '爆点文案…',
  },
  style: {
    newLabel: '新建风格',
    emptyHint: '轻量美学词典：名称、Prompt、可选参考图；分镜帧可点选 stylePreset',
    promptPlaceholder: '画面美学、光影、材质…',
  },
  sound: {
    newLabel: '新建声音',
    emptyHint: '配音 / 音效 / BGM 词典：名称、Prompt、可选音频；节点可 @声音 引用',
    promptPlaceholder: '声音描述…',
  },
};
export function AssetLibraryModal() {
  const open = useAssetLibraryModalUi((s) => s.open);
  const scope = useAssetLibraryModalUi((s) => s.scope);
  const acl = useLibraryAcl(scope);
  const { canRead, canWrite, canDelete: canDeleteItem } = acl;
  const tab = useAssetLibraryModalUi((s) => s.tab);
  const navigateRequest = useAssetLibraryModalUi((s) => s.navigateRequest);
  const setOpen = useAssetLibraryModalUi((s) => s.setOpen);
  const setScope = useAssetLibraryModalUi((s) => s.setScope);
  const setTab = useAssetLibraryModalUi((s) => s.setTab);
  const clearNavigateRequest = useAssetLibraryModalUi((s) => s.clearNavigateRequest);

  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const catalogItems = useWorkspaceCatalog((s) => s.items);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);

  const activeProject = useMemo(
    () => catalogItems.find((w) => w.id === activeId),
    [catalogItems, activeId],
  );

  const upsertCharacter = useWorkspaceDocument((s) => s.upsertCharacter);
  const removeCharacter = useWorkspaceDocument((s) => s.removeCharacter);
  const upsertSound = useWorkspaceDocument((s) => s.upsertSound);
  const removeSound = useWorkspaceDocument((s) => s.removeSound);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);
  const removeBacklotWorkspace = useWorkspaceDocument((s) => s.removeBacklotWorkspace);
  const setEnvironments = useWorkspaceDocument((s) => s.setEnvironments);
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);

  const fetchPublic = usePublicAssetLibrary((s) => s.fetch);
  const publicUpsertCharacter = usePublicAssetLibrary((s) => s.upsertCharacter);
  const publicRemoveCharacter = usePublicAssetLibrary((s) => s.removeCharacter);
  const publicUpsertSound = usePublicAssetLibrary((s) => s.upsertSound);
  const publicRemoveSound = usePublicAssetLibrary((s) => s.removeSound);
  const publicUpsertTemplate = usePublicAssetLibrary((s) => s.upsertTemplate);
  const publicRemoveTemplate = usePublicAssetLibrary((s) => s.removeTemplate);
  const publicUpsertStyle = usePublicAssetLibrary((s) => s.upsertStyle);
  const publicRemoveStyle = usePublicAssetLibrary((s) => s.removeStyle);
  const publicCharacters = usePublicAssetLibrary((s) => s.payload.characters);
  const publicSounds = usePublicAssetLibrary((s) => s.payload.sounds);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);
  const publicStyles = usePublicAssetLibrary((s) => s.payload.styles ?? []);

  const appendLog = useActivityLog((s) => s.append);
  const { items } = useAssetLibraryItems(scope, tab);

  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [suggestCreateLabel, setSuggestCreateLabel] = useState<string | null>(null);
  const [returnHint, setReturnHint] = useState<string | null>(null);
  const [healthFilterKey, setHealthFilterKey] = useState<HealthIssueKey | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [shotSystemId, setShotSystemId] = useState<string | 'all'>('all');
  const [shotCategory, setShotCategory] = useState<string | 'all'>('all');
  const [shotMoveFamily, setShotMoveFamily] = useState<ShotMoveFamily | 'all'>('all');
  const [shotSizeFilter, setShotSizeFilter] = useState<string | 'all'>('all');
  const [styleFamilyFilter, setStyleFamilyFilter] = useState<StyleAestheticFamily | 'all'>('all');
  const [soundKindFilter, setSoundKindFilter] = useState<SoundAssetKind | 'all'>('all');
  const [navStack, setNavStack] = useState<Array<{ tab: AssetLibraryKind; itemId: string; label: string }>>([]);
  const [costumeGenBusy, setCostumeGenBusy] = useState(false);
  const [costumeGenProgress, setCostumeGenProgress] = useState<string | null>(null);
  const [sceneGenBusy, setSceneGenBusy] = useState(false);
  const [propGenBusy, setPropGenBusy] = useState(false);
  const [entityGenError, setEntityGenError] = useState<string | null>(null);
  const [entityCropBusy, setEntityCropBusy] = useState(false);
  const [charSheetGenBusy, setCharSheetGenBusy] = useState(false);
  const [charSheetGenProgress, setCharSheetGenProgress] = useState<string | null>(null);
  const characterSheetGen = useAssetLibraryGenSettings((s) => s.characterSheet);
  const costumeSheetGen = useAssetLibraryGenSettings((s) => s.costumeSheet);
  const sceneSheetGen = useAssetLibraryGenSettings((s) => s.scene);
  const setCharacterSheetGen = useAssetLibraryGenSettings((s) => s.setCharacterSheet);
  const setCostumeSheetGen = useAssetLibraryGenSettings((s) => s.setCostumeSheet);
  const setSceneSheetGen = useAssetLibraryGenSettings((s) => s.setScene);

  useEffect(() => {
    if (open) void fetchPublic();
  }, [open, fetchPublic]);

  /** 情绪 / 爆点退出主导航；镜头/风格仅公共。私有误入时改道。 */
  useEffect(() => {
    if (!open) return;
    if (tab === 'hook') {
      setEditId(null);
      setTab(scope === 'public' ? 'shot' : 'character');
      return;
    }
    if (scope === 'private' && isAssetLibraryPublicOnlyKind(tab)) {
      setEditId(null);
      setTab('character');
      return;
    }
    if (tab === 'emotion' && !editId) {
      setTab(scope === 'public' ? 'shot' : 'character');
    }
  }, [open, tab, editId, scope, setTab]);

  useEffect(() => {
    if (!open || !navigateRequest) return;
    const nextScope =
      navigateRequest.scope
      ?? (isAssetLibraryPublicOnlyKind(navigateRequest.tab) ? 'public' : undefined);
    if (nextScope) setScope(nextScope);
    setTab(navigateRequest.tab);
    setSuggestCreateLabel(navigateRequest.suggestCreateLabel?.trim() || null);
    setReturnHint(navigateRequest.returnHint?.trim() || null);
    if (navigateRequest.scope === 'public' || isAssetLibraryPublicOnlyKind(navigateRequest.tab)) {
      if (navigateRequest.itemId) setEditId(navigateRequest.itemId);
    } else {
      const projectId = navigateRequest.projectId ?? activeId;
      if (projectId && projectId !== activeId) {
        void selectWorkspace(projectId);
      }
      if (navigateRequest.itemId) setEditId(navigateRequest.itemId);
      if (navigateRequest.query?.trim()) {
        setQuery(navigateRequest.query.trim());
      }
    }
    clearNavigateRequest();
  }, [
    open,
    navigateRequest,
    activeId,
    setScope,
    setTab,
    selectWorkspace,
    clearNavigateRequest,
  ]);

  useEffect(() => {
    if (!open) {
      setSuggestCreateLabel(null);
      setReturnHint(null);
    }
  }, [open]);

  const healthAnalysis = useAssetHealthAnalysis(characters, workspaceItems, sounds);

  useEffect(() => {
    setHealthFilterKey(null);
    setShotSystemId('all');
    setShotCategory('all');
    setShotMoveFamily('all');
    setShotSizeFilter('all');
    if (tab !== 'shot') setFavoriteOnly(false);
  }, [tab, scope]);

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

  const jumpToAsset = useCallback(
    (nextTab: AssetLibraryKind, itemId: string, label: string) => {
      const currentLabel =
        selectedChar?.name || selectedSound?.name || selectedWorkspaceItem?.label || '';
      if (editId && currentLabel) {
        setNavStack((s) => [...s, { tab, itemId: editId, label: currentLabel }]);
      }
      setTab(nextTab);
      setEditId(itemId);
      setQuery('');
      setHealthFilterKey(null);
    },
    [editId, tab, selectedChar, selectedSound, selectedWorkspaceItem, setTab],
  );

  const popNavStack = useCallback(() => {
    setNavStack((s) => {
      const next = [...s];
      const prev = next.pop();
      if (prev) {
        setTab(prev.tab);
        setEditId(prev.itemId);
        setQuery('');
      }
      return next;
    });
  }, [setTab]);

  const tabMeta = KIND_META[tab];
  /** 角色 / 服装 / 场景 / 道具 / 镜头全页编辑：收起库级 Tab / 健康条 / 搜索新建 */
  const characterFullEdit = tab === 'character' && Boolean(selectedChar);
  const entityFullEdit =
    ENTITY_CARD_TABS.has(tab) && Boolean(selectedWorkspaceItem);
  const shotFullEdit = tab === 'shot' && Boolean(selectedWorkspaceItem);
  const styleFullEdit = tab === 'style' && Boolean(selectedStyle);
  const soundFullEdit = tab === 'sound' && Boolean(selectedSound);
  const shellFullEdit =
    characterFullEdit || entityFullEdit || shotFullEdit || styleFullEdit || soundFullEdit;
  const canEditPrivate = (scope !== 'private' || Boolean(activeId)) && canWrite;
  const canCreateAsset =
    (scope === 'public' || canEditPrivate)
    && canWrite
    && tab !== 'hook'
    && tab !== 'emotion';

  /** 环境圣经 → 素材库场景页：补齐缺失条目，保证主路径只认素材库也能看到 extract 结果 */
  useEffect(() => {
    if (!open || scope !== 'private' || tab !== 'scene' || !canEditPrivate) return;
    const envs = environmentLibrary?.environments ?? [];
    if (envs.length === 0) return;
    const items = useWorkspaceDocument.getState().backlotWorkspace.items;
    for (const env of envs) {
      const existing = items.find((item) => {
        if (item.kind !== 'scene') return false;
        const creative = getSceneCreative(item);
        return (
          creative.environmentId === env.id
          || item.id === `scene-${env.id}`
          || normalizeName(item.label) === normalizeName(env.name)
        );
      });
      if (!existing) {
        upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(env));
      }
    }
  }, [open, scope, tab, canEditPrivate, environmentLibrary, upsertBacklotWorkspace]);

  const saveCharacter = useCallback(
    (c: CharacterProfile) => {
      const next = normalizeCharacterProfile(c);
      if (scope === 'private') upsertCharacter(next);
      else publicUpsertCharacter(next);
    },
    [scope, upsertCharacter, publicUpsertCharacter],
  );

  const saveWorkspaceItem = useCallback(
    (item: BacklotWorkspaceItem) => {
      if (scope === 'private') {
        let next = item;
        if (item.kind === 'scene') {
          const currentEnvs = useWorkspaceDocument.getState().environments?.environments ?? [];
          const existingEnv = currentEnvs.find((env) => {
            const creative = getSceneCreative(item);
            return (
              env.id === creative.environmentId
              || env.id === item.id.replace(/^scene-/, '')
              || normalizeName(env.name) === normalizeName(item.label)
            );
          });
          const env = workspaceItemToEnvironmentProfile(item, existingEnv);
          next = {
            ...item,
            creative: {
              ...getSceneCreative(item),
              environmentId: env.id,
              sceneCode: env.sceneCode,
              props: env.props,
              referenceUrls: env.referenceUrls,
            } as BacklotWorkspaceItem['creative'],
          };
          setEnvironments({
            version: 1,
            environments: [...currentEnvs.filter((e) => e.id !== env.id), env],
          });
        }
        upsertBacklotWorkspace(next);
        return;
      }
      const existing = publicTemplates.find((t) => t.id === item.id);
      const isBuiltinOnly =
        !existing
        && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === item.id && t.kind === item.kind);
      // 内置镜头词典只读：禁止同 id 就地覆盖；请走「导入副本」
      if (isBuiltinOnly && item.kind === 'shot') {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      if (isBuiltinOnly) {
        publicUpsertTemplate(
          workspaceItemToCustomTemplate(item, '公共库', undefined, {
            id: item.id,
            createdAt: Date.now(),
          }),
        );
        return;
      }
      publicUpsertTemplate(
        workspaceItemToCustomTemplate(
          item,
          existing?.group || '公共库',
          undefined,
          existing
            ? { id: existing.id, createdAt: existing.createdAt }
            : { id: item.id, createdAt: Date.now() },
        ),
      );
    },
    [scope, upsertBacklotWorkspace, publicUpsertTemplate, setEnvironments, publicTemplates],
  );

  const saveSound = useCallback(
    (s: SoundAssetProfile) => {
      if (isBuiltinSoundAsset(s)) {
        toastError('内置声音不可修改，请先导入副本');
        return;
      }
      if (scope === 'private') upsertSound(s);
      else publicUpsertSound(s);
    },
    [scope, upsertSound, publicUpsertSound],
  );

  const handleCreate = useCallback((prefillLabel?: string) => {
    if (scope === 'private' && !canEditPrivate) return;
    if (tab === 'hook' || tab === 'emotion') return;
    const label = prefillLabel?.trim();
    if (tab === 'character') {
      const c = newCharacterProfile(label || undefined);
      saveCharacter(c);
      setEditId(c.id);
      setSuggestCreateLabel(null);
      return;
    }
    if (tab === 'sound') {
      const s = refreshVoicePrompts(newSoundAsset(label || undefined));
      saveSound(s);
      setEditId(s.id);
      setSuggestCreateLabel(null);
      return;
    }
    if (tab === 'style') {
      if (scope !== 'public') return;
      const s = newStylePreset({ name: label || '未命名风格' });
      publicUpsertStyle(s);
      setEditId(s.id);
      setSuggestCreateLabel(null);
      setQuery('');
      return;
    }
    if (scope === 'private') {
      const item = refreshWorkspacePrompts({
        ...newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>),
        ...(label ? { label } : {}),
      });
      saveWorkspaceItem(item);
      setEditId(item.id);
      setSuggestCreateLabel(null);
      setQuery('');
      return;
    }
    const tpl = workspaceItemToCustomTemplate(
      refreshWorkspacePrompts({
        ...newBacklotWorkspaceItem(tab as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>),
        ...(label ? { label } : {}),
      }),
      '公共库',
    );
    publicUpsertTemplate(tpl);
    setEditId(tpl.id);
    setSuggestCreateLabel(null);
  }, [
    scope,
    canEditPrivate,
    tab,
    saveCharacter,
    saveSound,
    saveWorkspaceItem,
    publicUpsertTemplate,
    publicUpsertStyle,
  ]);

  const suggestCreateExactExists = useMemo(() => {
    if (!suggestCreateLabel) return false;
    const needle = suggestCreateLabel.trim().toLowerCase();
    return items.some((i) => i.label.trim().toLowerCase() === needle);
  }, [suggestCreateLabel, items]);

  const handleCloneBuiltin = useCallback(
    (templateId: string) => {
      if (tab === 'style') {
        if (scope !== 'public') return;
        const source =
          stylesById.get(templateId)
          ?? BUILTIN_STYLE_PRESETS.find((s) => s.id === templateId);
        if (!source) return;
        if (!isBuiltinStylePreset(source) && publicStyles.some((s) => s.id === templateId)) {
          // 已是自定义条目：再复制一份
          const copy = cloneStylePreset(source);
          publicUpsertStyle(copy);
          setEditId(copy.id);
          toastSuccess(`已复制「${copy.name}」`);
          return;
        }
        const copy = cloneStylePreset(source);
        publicUpsertStyle(copy);
        setEditId(copy.id);
        toastSuccess(`已导入风格副本「${copy.name}」`);
        return;
      }
      if (tab === 'sound') {
        const source =
          soundsById.get(templateId)
          ?? BUILTIN_PUBLIC_SOUND_ASSETS.find((s) => s.id === templateId);
        if (!source) return;
        if (scope === 'private' && !canEditPrivate) return;
        const copy = refreshVoicePrompts(cloneSoundAsset(source));
        if (scope === 'private') {
          upsertSound(copy);
        } else {
          publicUpsertSound(copy);
        }
        setEditId(copy.id);
        toastSuccess(
          isBuiltinSoundAsset(source)
            ? `已导入声音副本「${copy.name}」`
            : `已复制「${copy.name}」`,
        );
        return;
      }
      if (tab === 'character') return;
      if (scope === 'private' && !canEditPrivate) return;
      const tpl = BUILTIN_BACKLOT_TEMPLATES.find((x) => x.id === templateId && x.kind === tab);
      if (!tpl || tpl.kind === 'character') return;
      const base = templateToWorkspaceItem(tpl, tpl.id);
      if (!base) return;
      const item = refreshWorkspacePrompts(base);
      if (scope === 'private') {
        saveWorkspaceItem(item);
        setEditId(item.id);
        toastSuccess(`已从模板导入「${item.label}」`);
        appendLog(`服装/素材库：导入模板 ${item.label}`);
        return;
      }
      const custom = workspaceItemToCustomTemplate(item, tpl.group || '公共库');
      publicUpsertTemplate(custom);
      setEditId(custom.id);
      toastSuccess(`已导入公共库「${custom.label}」`);
    },
    [
      tab,
      scope,
      canEditPrivate,
      stylesById,
      publicStyles,
      publicUpsertStyle,
      soundsById,
      upsertSound,
      publicUpsertSound,
      saveWorkspaceItem,
      publicUpsertTemplate,
      appendLog,
    ],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (tab === 'shot') {
        const isBuiltin =
          !publicTemplates.some((t) => t.id === id && t.kind === 'shot')
          && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === id && t.kind === 'shot');
        if (isBuiltin) {
          toastError('内置镜头不可删除');
          return;
        }
      }
      if (tab === 'style') {
        const style =
          stylesById.get(id)
          ?? BUILTIN_STYLE_PRESETS.find((s) => s.id === id);
        if (isBuiltinStylePreset(style)) {
          toastError('内置风格不可删除');
          return;
        }
      }
      if (tab === 'sound') {
        const sound =
          soundsById.get(id)
          ?? BUILTIN_PUBLIC_SOUND_ASSETS.find((s) => s.id === id);
        if (isBuiltinSoundAsset(sound)) {
          toastError('内置声音不可删除');
          return;
        }
      }
      const ok = await confirmDelete({
        title: '移入回收站？',
        description: '素材将移入回收站，30 天内可恢复。',
      });
      if (!ok) return;
      if (tab === 'character') {
        if (scope === 'private') removeCharacter(id);
        else publicRemoveCharacter(id);
      } else if (tab === 'sound') {
        if (scope === 'private') removeSound(id);
        else publicRemoveSound(id);
      } else if (tab === 'style') {
        if (scope === 'public') publicRemoveStyle(id);
      } else if (scope === 'private') {
        if (tab === 'scene') {
          const item = workspaceItems.find((x) => x.id === id);
          if (item) {
            const env = workspaceItemToEnvironmentProfile(item);
            const current = useWorkspaceDocument.getState().environments?.environments ?? [];
            setEnvironments({
              version: 1,
              environments: current.filter(
                (e) => e.id !== env.id && normalizeName(e.name) !== normalizeName(item.label),
              ),
            });
          }
        }
        removeBacklotWorkspace(id);
      } else {
        publicRemoveTemplate(id);
      }
      if (editId === id) setEditId(null);
      toastSuccess('已移入回收站');
    },
    [
      tab,
      scope,
      editId,
      workspaceItems,
      publicTemplates,
      removeCharacter,
      publicRemoveCharacter,
      removeSound,
      publicRemoveSound,
      publicRemoveStyle,
      removeBacklotWorkspace,
      publicRemoveTemplate,
      setEnvironments,
      stylesById,
      soundsById,
    ],
  );

  const handleUploadCharacterView = useCallback(
    async (file: File, char: CharacterProfile, view: string) => {
      const res = await api.uploadAsset(file);
      const fieldMap: Record<string, string> = {
        full: 'fullSheetUrl',
        front: 'frontViewUrl',
        threeQuarter: 'threeQuarterViewUrl',
        side: 'sideViewUrl',
        back: 'backViewUrl',
        silhouetteFront: 'silhouetteFrontUrl',
        silhouetteSide: 'silhouetteSideUrl',
      };

      // variant uploads: expr:id / micro:id / angle:id / pose:id / costumeDetail:id / hand:id
      if (view.includes(':')) {
        const [group, id] = view.split(':');
        const creative = { ...(char.creative ?? {}) } as Record<string, unknown>;
        const groupKey =
          group === 'expr' ? 'expressions'
            : group === 'micro' ? 'microExpressions'
              : group === 'angle' ? 'angles'
                : group === 'pose' ? 'poses'
                  : group === 'costumeDetail' ? 'costumeDetails'
                    : group === 'hand' ? 'handRefs'
                      : null;
        if (!groupKey) return;
        const list = Array.isArray(creative[groupKey]) ? [...(creative[groupKey] as any[])] : [];
        const idx = list.findIndex((item) => item.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], imageUrl: res.url };
        else list.push({ id, label: id, imageUrl: res.url });
        creative[groupKey] = list;
        saveCharacter({ ...char, creative: creative as CharacterProfile['creative'] });
        return;
      }

      const key = fieldMap[view] ?? 'frontViewUrl';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          [key]: res.url,
        },
        referenceImageUrl: view === 'front' || view === 'full' ? res.url : char.referenceImageUrl,
      });
    },
    [saveCharacter],
  );


  /** 素材库出图：直接走设置连接中的模型 + 本地面板参数，不依赖画布 picture-gen 实体节点 */
  const resolveAssetGenRequest = useCallback((kind: 'character-sheet' | 'costume-sheet' | 'scene-sheet' | 'prop-sheet') => {
    if (kind === 'character-sheet') {
      // 设定板裁切依赖固定母板；不能让用户的通用尺寸设置改变坐标系。
      return resolveAssetLibraryImageRequest(
        { ...characterSheetGen, aspectRatio: 'custom', quality: 'high', resolutionTier: '4k' },
        { width: CHARACTER_SHEET_CANVAS_WIDTH, height: CHARACTER_SHEET_CANVAS_HEIGHT },
      );
    }
    if (kind === 'scene-sheet') {
      return resolveAssetLibraryImageRequest(sceneSheetGen);
    }
    if (kind === 'prop-sheet') {
      return resolveAssetLibraryImageRequest(costumeSheetGen);
    }
    return resolveAssetLibraryImageRequest(costumeSheetGen);
  }, [characterSheetGen, costumeSheetGen, sceneSheetGen]);

  const uploadCroppedEntityCover = useCallback(
    async (sheetUrl: string, kind: EntitySheetCropKind, fileStem: string): Promise<string> => {
      const blob = await cropEntitySheetPanel(sheetUrl, kind);
      const file = new File([blob], `${fileStem}.jpg`, { type: 'image/jpeg' });
      const uploaded = await api.uploadAsset(file);
      return uploaded.url;
    },
    [],
  );

  const cropWorkspaceEntityCover = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('裁切封面：请在可编辑私有库中操作');
        return;
      }
      const sheetUrl =
        item.kind === 'costume'
          ? getCostumeCreative(item).sheetUrl
          : item.kind === 'scene'
            ? getSceneCreative(item).sheetUrl
            : item.kind === 'prop'
              ? getPropCreative(item).sheetUrl
              : null;
      if (!sheetUrl?.trim()) {
        appendLog('裁切封面：请先有设定板图片');
        return;
      }
      const cropKind: EntitySheetCropKind =
        item.kind === 'scene' ? 'scene-hero' : item.kind === 'prop' ? 'prop-front' : 'costume-front';
      setEntityCropBusy(true);
      try {
        const coverUrl = await uploadCroppedEntityCover(sheetUrl, cropKind, `cover-${item.kind}-${item.id}`);
        if (item.kind === 'costume') {
          const ext = getCostumeCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, frontFlatUrl: coverUrl } });
        } else if (item.kind === 'scene') {
          const ext = getSceneCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, coverUrl } });
        } else if (item.kind === 'prop') {
          const ext = getPropCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, coverUrl } });
        }
        toastSuccess('封面已从设定板裁切');
        appendLog(`封面裁切完成 · ${item.label}`);
      } catch (e) {
        appendLog(`封面裁切失败 · ${item.label}: ${String(e)}`);
      } finally {
        setEntityCropBusy(false);
      }
    },
    [appendLog, canEditPrivate, saveWorkspaceItem, scope, uploadCroppedEntityCover],
  );

  const generateCostumeSheets = useCallback(
    async (items: BacklotWorkspaceItem[]) => {
      if (scope !== 'private') {
        appendLog('服装设定板：请先导入到私有项目库再生成');
        return;
      }
      if (!canEditPrivate) {
        appendLog('服装设定板：当前项目不可编辑');
        return;
      }
      const targets = items.filter((i) => i.kind === 'costume');
      if (targets.length === 0) {
        appendLog('服装设定板：没有可生成的服装条目');
        return;
      }
      setCostumeGenBusy(true);
      setCostumeGenProgress(`0/${targets.length}`);
      appendLog(`开始生成服装设定板 · ${targets.length} 件`);

      const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('costume-sheet');
      appendLog(`服装设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setCostumeGenProgress(`${i + 1}/${targets.length}`);
        try {
          const refreshed = refreshWorkspacePrompts(item);
          const prompt = buildCostumeSheetGenerationPrompt(refreshed);
          const urls = await runPictureGenJob({
            prompt,
            modelId,
            size,
            n: 1,
            resolutionTier,
          });
          const imageUrl = urls[0];
          if (!imageUrl) throw new Error('未返回图片');
          const ext = getCostumeCreative(refreshed);
          let frontFlatUrl = ext.frontFlatUrl || imageUrl;
          try {
            frontFlatUrl = await uploadCroppedEntityCover(
              imageUrl,
              'costume-front',
              `costume-front-${item.id}`,
            );
          } catch (cropErr) {
            appendLog(`服装封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
          }
          saveWorkspaceItem({
            ...refreshed,
            creative: {
              ...ext,
              sheetUrl: imageUrl,
              frontFlatUrl,
            },
          });
          ok += 1;
          appendLog(`服装设定板完成 · ${item.label}`);
        } catch (e) {
          fail += 1;
          appendLog(`服装设定板失败 · ${item.label}: ${String(e)}`);
        }
      }

      setCostumeGenBusy(false);
      setCostumeGenProgress(null);
      appendLog(`服装设定板批量结束 · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`服装设定板完成 ${ok}/${targets.length}`);
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover],
  );

  const generateSceneSheet = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('场景设定板：请在可编辑私有库中生成');
        return;
      }
      if (item.kind !== 'scene') return;
      setSceneGenBusy(true);
      setEntityGenError(null);
      appendLog(`开始生成场景空间设定板 · ${item.label}`);
      try {
        const refreshed = refreshWorkspacePrompts(item);
        const prompt = buildSceneSheetGenerationPrompt(refreshed);
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('scene-sheet');
        appendLog(`场景设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const urls = await runPictureGenJob({ prompt, modelId, size, n: 1, resolutionTier });
        const imageUrl = urls[0];
        if (!imageUrl) throw new Error('未返回图片');
        const ext = getSceneCreative(refreshed);
        let coverUrl = ext.coverUrl || undefined;
        try {
          coverUrl = await uploadCroppedEntityCover(imageUrl, 'scene-hero', `scene-cover-${item.id}`);
        } catch (cropErr) {
          appendLog(`场景封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
        }
        saveWorkspaceItem({
          ...refreshed,
          creative: { ...ext, sheetUrl: imageUrl, coverUrl: coverUrl ?? ext.coverUrl },
        });
        toastSuccess(`场景设定板已生成：${item.label}`);
        appendLog(`场景设定板完成 · ${item.label}`);
      } catch (e) {
        const msg = String(e);
        setEntityGenError(msg);
        appendLog(`场景设定板失败 · ${item.label}: ${msg}`);
      } finally {
        setSceneGenBusy(false);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover],
  );

  const generatePropSheet = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('道具设定板：请在可编辑私有库中生成');
        return;
      }
      if (item.kind !== 'prop') return;
      setPropGenBusy(true);
      setEntityGenError(null);
      appendLog(`开始生成道具三视图板 · ${item.label}`);
      try {
        const refreshed = refreshWorkspacePrompts(item);
        const prompt = buildPropSheetGenerationPrompt(refreshed);
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('prop-sheet');
        appendLog(`道具设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const urls = await runPictureGenJob({ prompt, modelId, size, n: 1, resolutionTier });
        const imageUrl = urls[0];
        if (!imageUrl) throw new Error('未返回图片');
        const ext = getPropCreative(refreshed);
        let coverUrl = ext.coverUrl || undefined;
        try {
          coverUrl = await uploadCroppedEntityCover(imageUrl, 'prop-front', `prop-cover-${item.id}`);
        } catch (cropErr) {
          appendLog(`道具封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
        }
        saveWorkspaceItem({
          ...refreshed,
          creative: { ...ext, sheetUrl: imageUrl, coverUrl: coverUrl ?? ext.coverUrl },
        });
        toastSuccess(`道具三视图板已生成：${item.label}`);
        appendLog(`道具设定板完成 · ${item.label}`);
      } catch (e) {
        const msg = String(e);
        setEntityGenError(msg);
        appendLog(`道具设定板失败 · ${item.label}: ${msg}`);
      } finally {
        setPropGenBusy(false);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover],
  );

  const suggestCreatePropsFromScene = useCallback(
    (sceneItem: BacklotWorkspaceItem, names: string[]) => {
      if (scope !== 'private' || !canEditPrivate) return;
      const createdIds: string[] = [];
      for (const name of names) {
        const label = name.trim();
        if (!label) continue;
        const exists = workspaceItems.find(
          (w) => w.kind === 'prop' && w.label.trim().toLowerCase() === label.toLowerCase(),
        );
        if (exists) {
          createdIds.push(exists.id);
          continue;
        }
        const item = refreshWorkspacePrompts({
          ...newBacklotWorkspaceItem('prop'),
          label,
          promptZh: label,
          creative: {
            description: `从场景「${sceneItem.label}」文本道具建档`,
            linkedSceneIds: [sceneItem.id],
            linkedScenes: [sceneItem.label],
          },
        });
        saveWorkspaceItem(item);
        createdIds.push(item.id);
      }
      const ext = getSceneCreative(sceneItem);
      const nextPropIds = [...new Set([...(ext.propIds ?? []), ...createdIds])];
      const remainingText = (ext.props ?? []).filter(
        (p) => !names.some((n) => n.trim().toLowerCase() === p.trim().toLowerCase()),
      );
      saveWorkspaceItem({
        ...sceneItem,
        creative: {
          ...ext,
          propIds: nextPropIds,
          props: remainingText,
        },
      });
      toastSuccess(`已建档并挂接 ${createdIds.length} 个道具`);
      appendLog(`场景「${sceneItem.label}」：文本道具建档 ${createdIds.length} 个`);
    },
    [appendLog, canEditPrivate, saveWorkspaceItem, scope, workspaceItems],
  );

  const togglePropLinkedScene = useCallback(
    (propItem: BacklotWorkspaceItem, sceneId: string, linked: boolean) => {
      const propExt = getPropCreative(propItem);
      const nextLinked = linked
        ? [...new Set([...(propExt.linkedSceneIds ?? []), sceneId])]
        : (propExt.linkedSceneIds ?? []).filter((id) => id !== sceneId);
      saveWorkspaceItem({
        ...propItem,
        creative: { ...propExt, linkedSceneIds: nextLinked },
      });
      const scene = workspaceItems.find((w) => w.id === sceneId && w.kind === 'scene');
      if (!scene) return;
      const sceneExt = getSceneCreative(scene);
      const nextPropIds = linked
        ? [...new Set([...(sceneExt.propIds ?? []), propItem.id])]
        : (sceneExt.propIds ?? []).filter((id) => id !== propItem.id);
      saveWorkspaceItem({
        ...scene,
        creative: { ...sceneExt, propIds: nextPropIds },
      });
    },
    [saveWorkspaceItem, workspaceItems],
  );

  const generateCharacterMasterSheet = useCallback(
    async (char: CharacterProfile) => {
      if (scope === 'private' && !canEditPrivate) {
        appendLog('角色设定板：当前项目不可编辑');
        return;
      }

      setCharSheetGenBusy(true);
      setCharSheetGenProgress('生成完整设定板…');
      appendLog(`开始生成角色完整设定板 · ${char.name || char.id}`);

      try {
        const refreshed = refreshCharacterPrompts(char);
        const masterPack = await getGenPack('gen-character-sheet-master');
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('character-sheet');
        appendLog(`完整设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const seedUrl =
          refreshed.referenceImageUrl
          || refreshed.creative?.frontViewUrl
          || undefined;
        const prompt = buildCharacterSheetGenerationPrompt(refreshed, masterPack);
        const urls = await runPictureGenJob({
          prompt,
          modelId,
          size,
          n: 1,
          resolutionTier,
          referenceImageUrl: seedUrl || undefined,
        });
        const sheetUrl = urls[0];
        if (!sheetUrl) throw new Error('完整设定板未返回图片');

        const ext = getCharacterCreative(refreshed);
        saveCharacter({
          ...refreshed,
          creative: {
            ...ext,
            fullSheetUrl: sheetUrl,
          },
        });
        appendLog(`角色完整设定板完成 · ${char.name || char.id}`);
        toastSuccess('角色完整设定板已生成，确认后再生成五类原图');
      } catch (e) {
        appendLog(`角色完整设定板失败: ${String(e)}`);
      } finally {
        setCharSheetGenBusy(false);
        setCharSheetGenProgress(null);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveCharacter, scope],
  );

  const generateCharacterCategorySheets = useCallback(
    async (char: CharacterProfile) => {
      if (scope === 'private' && !canEditPrivate) {
        appendLog('五类原图：当前项目不可编辑');
        return;
      }

      const masterUrl = char.creative?.fullSheetUrl?.trim();
      if (!masterUrl) {
        appendLog('五类原图：请先生成并确认角色完整设定板');
        toastSuccess('请先生成角色完整设定板');
        return;
      }

      setCharSheetGenBusy(true);
      setCharSheetGenProgress('生成分类图 0/5');
      appendLog(`开始生成五类原图 · ${char.name || char.id}`);

      try {
        const refreshed = refreshCharacterPrompts(char);
        const masterPack = await getGenPack('gen-character-sheet-master');
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('character-sheet');
        appendLog(`五类原图参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size} · 参考完整设定板`);

        const panelUrls: Record<string, string> = {};
        const categorySheetUrls: Record<string, string> = {};
        for (let categoryIndex = 0; categoryIndex < CHARACTER_SHEET_CATEGORY_LAYOUTS.length; categoryIndex++) {
          const category = CHARACTER_SHEET_CATEGORY_LAYOUTS[categoryIndex];
          setCharSheetGenProgress(`生成分类图 ${categoryIndex + 1}/5：${category.label}`);
          const prompt = buildCharacterSheetGenerationPrompt(refreshed, masterPack, category.id);
          const urls = await runPictureGenJob({
            prompt,
            modelId,
            size,
            n: 1,
            resolutionTier,
            referenceImageUrl: masterUrl,
          });
          const sheetUrl = urls[0];
          if (!sheetUrl) throw new Error(`${category.label}未返回图片`);
          categorySheetUrls[category.id] = sheetUrl;

          const blobs = await cropCharacterSheetPanels(sheetUrl, category);
          const entries = Object.entries(blobs);
          for (let i = 0; i < entries.length; i++) {
            const [panelId, blob] = entries[i];
            setCharSheetGenProgress(`裁切上传 ${categoryIndex + 1}/5 · ${i + 1}/${entries.length}`);
            const file = new File([blob], `char-sheet-${char.id}-${category.id}-${panelId}.jpg`, { type: 'image/jpeg' });
            const uploaded = await api.uploadAsset(file);
            panelUrls[panelId] = uploaded.url;
          }
        }

        const next = applyCroppedPanelsToCharacter(refreshed, {
          panelUrls,
          categorySheetUrls,
          overwrite: true,
        });
        saveCharacter(next);
        appendLog(`五类原图完成并回填 ${Object.keys(panelUrls).length} 格 · ${char.name || char.id}`);
        toastSuccess(`五类原图已回填 ${Object.keys(panelUrls).length} 个面板`);
      } catch (e) {
        appendLog(`五类原图失败: ${String(e)}`);
      } finally {
        setCharSheetGenBusy(false);
        setCharSheetGenProgress(null);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveCharacter, scope],
  );

  const handleUploadWorkspaceMedia = useCallback(
    async (file: File, item: BacklotWorkspaceItem, field: string) => {
      const res = await api.uploadAsset(file);
      const creative = { ...(item.creative as Record<string, unknown>) };
      if (field === 'referenceUrls') {
        const prev = Array.isArray(creative.referenceUrls)
          ? (creative.referenceUrls.filter(Boolean) as string[])
          : [];
        if (prev.includes(res.url)) {
          appendLog('参考图已存在，跳过重复上传');
          return;
        }
        if (prev.length >= MAX_ENV_REFERENCE_IMAGES) {
          appendLog(`参考图已达上限 ${MAX_ENV_REFERENCE_IMAGES} 张`);
          return;
        }
        creative.referenceUrls = [...prev, res.url];
      } else {
        creative[field] = res.url;
      }
      saveWorkspaceItem({ ...item, creative: creative as BacklotWorkspaceItem['creative'] });
    },
    [appendLog, saveWorkspaceItem],
  );

  const handleRemoveSceneRef = useCallback(
    (item: BacklotWorkspaceItem, index: number) => {
      const creative = getSceneCreative(item);
      const refs = [...(creative.referenceUrls ?? [])];
      if (index < 0 || index >= refs.length) return;
      refs.splice(index, 1);
      saveWorkspaceItem({
        ...item,
        creative: { ...creative, referenceUrls: refs } as BacklotWorkspaceItem['creative'],
      });
    },
    [saveWorkspaceItem],
  );

  const handleUploadAudio = useCallback(
    async (file: File, target: { kind: 'character' | 'sound'; id: string }) => {
      const res = await api.uploadAsset(file);
      if (target.kind === 'character') {
        const c = (scope === 'private' ? characters : publicCharacters).find((x) => x.id === target.id);
        if (!c) return;
        saveCharacter({ ...c, referenceAudioUrl: res.url });
      } else {
        const s = (scope === 'private' ? sounds : publicSounds).find((x) => x.id === target.id);
        if (!s) return;
        saveSound({ ...s, audioUrl: res.url });
      }
    },
    [scope, characters, publicCharacters, sounds, publicSounds, saveCharacter, saveSound],
  );

  const promoteToPublic = useCallback(() => {
    if (!selectedWorkspaceItem || scope !== 'private') return;
    const tpl = workspaceItemToCustomTemplate(selectedWorkspaceItem, '公共库');
    publicUpsertTemplate(tpl);
    toastSuccess('已复制到公共素材库');
  }, [selectedWorkspaceItem, scope, publicUpsertTemplate]);

  // F-038: 从公共库复制非内置条目到当前项目私有库（UX-10：复制后自动切私有并选中）
  const handleCopyPublicToWorkspace = useCallback(
    (itemId: string) => {
      if (!activeId) {
        toastSuccess('请先打开一个项目');
        return;
      }
      const publicChar = publicCharacters.find((c) => c.id === itemId);
      if (publicChar) {
        const copied = refreshCharacterPrompts(
          normalizeCharacterProfile({
            ...publicChar,
            id: `char_${Date.now().toString(36)}`,
            sourceTemplateId: publicChar.id,
          }),
        );
        upsertCharacter(copied);
        setScope('private');
        setTab('character');
        setEditId(copied.id);
        setQuery('');
        toastSuccess(`已复制「${copied.name}」到当前项目并开始编辑`);
        appendLog(`素材库：复制公共角色「${copied.name}」到项目`);
        return;
      }
      const tpl = publicTemplates.find((t) => t.id === itemId);
      if (!tpl) return;
      const workspaceItem = templateToWorkspaceItem(tpl, tpl.id);
      if (!workspaceItem) return;
      const item = refreshWorkspacePrompts(workspaceItem);
      saveWorkspaceItem(item);
      setScope('private');
      setTab(item.kind);
      setEditId(item.id);
      setQuery('');
      toastSuccess(`已复制「${item.label}」到当前项目并开始编辑`);
      appendLog(`素材库：复制公共素材「${item.label}」到项目`);
    },
    [
      activeId,
      publicCharacters,
      publicTemplates,
      upsertCharacter,
      saveWorkspaceItem,
      appendLog,
      setScope,
      setTab,
    ],
  );

  const handleToggleCharacterLock = useCallback(
    (id: string) => {
      const pool = scope === 'private' ? characters : publicCharacters;
      const char = pool.find((c) => c.id === id);
      if (!char) return;
      const locked = Boolean(char.creative?.consistency?.locked);
      const nextLocked = !locked;
      const snap = char.consistencyPrompt?.trim() || '';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          viewsLocked: nextLocked,
          consistency: {
            ...char.creative?.consistency,
            locked: nextLocked,
            lockedPromptSnapshot: nextLocked
              ? snap
              : char.creative?.consistency?.lockedPromptSnapshot,
            lockedAt: nextLocked
              ? new Date().toISOString()
              : char.creative?.consistency?.lockedAt,
          },
        },
      });
    },
    [scope, characters, publicCharacters, saveCharacter],
  );

  const handleToggleEntityLock = useCallback(
    (id: string) => {
      if (!ENTITY_CARD_TABS.has(tab)) return;
      const item = workspaceById.get(id);
      if (!item || item.kind !== tab) return;
      if (tab === 'costume') {
        const ext = getCostumeCreative(item);
        saveWorkspaceItem({ ...item, creative: { ...ext, locked: !ext.locked } });
        return;
      }
      if (tab === 'prop') {
        const ext = getPropCreative(item);
        saveWorkspaceItem({ ...item, creative: { ...ext, locked: !ext.locked } });
        return;
      }
      const ext = getSceneCreative(item);
      saveWorkspaceItem({ ...item, creative: { ...ext, locked: !ext.locked } });
    },
    [tab, workspaceById, saveWorkspaceItem],
  );

  const isBuiltinShotId = useCallback(
    (id: string) =>
      !publicTemplates.some((t) => t.id === id && t.kind === 'shot')
      && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === id && t.kind === 'shot'),
    [publicTemplates],
  );

  const handleEditShot = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请用「导入副本」');
        return;
      }
      setEditId(id);
    },
    [isBuiltinShotId],
  );

  const handleToggleShotFavorite = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      const base = workspaceById.get(id);
      if (!base || base.kind !== 'shot') return;
      const ext = getShotCreative(base);
      saveWorkspaceItem({ ...base, creative: { ...ext, favorite: !ext.favorite } });
    },
    [workspaceById, isBuiltinShotId, saveWorkspaceItem],
  );

  const handleToggleShotLock = useCallback(
    (id: string) => {
      if (isBuiltinShotId(id)) {
        toastError('内置镜头不可修改，请先导入副本');
        return;
      }
      const base = workspaceById.get(id);
      if (!base || base.kind !== 'shot') return;
      const ext = getShotCreative(base);
      const locked = !ext.locked;
      const prompt = base.promptEn?.trim() || ext.prompts?.shot?.text?.trim() || '';
      saveWorkspaceItem({
        ...base,
        creative: {
          ...ext,
          locked,
          lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
          lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
        },
      });
    },
    [workspaceById, isBuiltinShotId, saveWorkspaceItem],
  );

  const handleEditStyle = useCallback(
    (id: string) => {
      // 内置也可打开只读预览；真正写入由 handleSaveStyle / 上传拦截
      setEditId(id);
    },
    [],
  );

  const handleToggleStyleFavorite = useCallback(
    (id: string) => {
      const style = stylesById.get(id);
      if (!style) return;
      if (isBuiltinStylePreset(style)) {
        toastError('内置风格不可修改，请先导入副本');
        return;
      }
      publicUpsertStyle({ ...style, favorite: !style.favorite });
    },
    [stylesById, publicUpsertStyle],
  );

  const handleSaveStyle = useCallback(
    (next: StylePresetProfile) => {
      if (scope !== 'public') return;
      if (isBuiltinStylePreset(next)) {
        toastError('内置风格不可修改，请先导入副本');
        return;
      }
      publicUpsertStyle(next);
    },
    [scope, publicUpsertStyle],
  );

  const handleEditSound = useCallback((id: string) => {
    setEditId(id);
  }, []);

  const handleToggleSoundFavorite = useCallback(
    (id: string) => {
      const sound = soundsById.get(id);
      if (!sound) return;
      if (isBuiltinSoundAsset(sound)) {
        toastError('内置声音不可修改，请先导入副本');
        return;
      }
      const nextFav = !isSoundFavorite(sound);
      const ext = getVoiceCreative(sound);
      saveSound({
        ...sound,
        favorite: nextFav,
        creative: { ...ext, favorite: nextFav },
      });
    },
    [soundsById, saveSound],
  );

  const handleScopeChange = useCallback(
    (next: AssetScope) => {
      // UX-11：尽量保留 query；选中仅在目标库找不到同 id 时清空
      setScope(next);
      setEditId((prev) => prev);
      // 切 scope 后 items 会变，下一帧再校验选中是否仍存在
      setTimeout(() => {
        /* selection validated via selected* memos becoming undefined */
      }, 0);
    },
    [setScope],
  );

  if (!open) return null;

  // 须高于 ScreenModal(240)：从编剧台「设定就绪」打开时不能被挡住；低于 confirm(280)/lightbox(300)
  // portal 到 body，避免被 main/画布 stacking context 压住
  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="素材库">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        aria-label="关闭素材库"
        onClick={() => setOpen(false)}
      />
      <div className="nx9-asset-library-modal relative w-[min(1120px,96vw)] h-[min(820px,92vh)] bg-surface rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-line">
        <header className="shrink-0 h-14 border-b border-line flex items-center px-5 gap-3">
          <Layers size={20} className="text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base text-ink">素材库</h2>
            <p className="text-[11px] text-ink/40 truncate">
              {scope === 'private'
                ? `项目私有 · ${activeProject?.title ?? '未打开项目'}`
                : '公共素材 · 全项目可用'}
            </p>
          </div>
          <div className="flex rounded-xl border border-line p-0.5 bg-surface">
            <button
              type="button"
              onClick={() => handleScopeChange('private')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'private' ? 'bg-surface shadow-sm text-brand' : 'text-ink/50'
              }`}
            >
              <FolderLock size={14} />
              项目私有
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('public')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'public' ? 'bg-surface shadow-sm text-brand' : 'text-ink/50'
              }`}
            >
              <Globe2 size={14} />
              公共
            </button>
          </div>
          <button
            type="button"
            title="资产回收站"
            onClick={() => setShowTrash((v) => !v)}
            className={`p-2 rounded-lg hover:bg-surface ${showTrash ? 'text-warn bg-warn/10' : 'text-ink/50'}`}
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-surface text-ink/50"
          >
            <X size={18} />
          </button>
        </header>

        {showTrash ? (
          <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
            <AssetTrashPanel defaultScope={scope} />
          </div>
        ) : (
        <div className="flex flex-1 min-h-0 flex-col">
              {!shellFullEdit ? (
                <>
                  <div className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-line overflow-x-auto nx9-scroll">
                    {assetLibraryTabGroupsForScope(scope).map((group, gi) => (
                      <div key={group.id} className="flex items-center gap-1.5 shrink-0">
                        {gi > 0 ? (
                          <span
                            className="mx-0.5 h-4 w-px shrink-0 bg-line"
                            aria-hidden
                            title={group.label}
                          />
                        ) : null}
                        {group.keys.map((key) => {
                          const t = ASSET_LIBRARY_TABS.find((row) => row.key === key);
                          if (!t) return null;
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => {
                                setTab(t.key);
                                setEditId(null);
                                setSuggestCreateLabel(null);
                                setFavoriteOnly(false);
                              }}
                              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
                                tab === t.key
                                  ? 'bg-brand/10 border-brand/40 text-brand font-medium'
                                  : 'border-line text-ink/60 hover:border-brand/20'
                              }`}
                              title={`${group.label} · ${t.hint}`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <AssetHealthBar
                    tab={tab}
                    analysis={healthAnalysis}
                    activeKey={healthFilterKey}
                    onSelectIssue={setHealthFilterKey}
                    onOpenItem={(id) => setEditId(id)}
                  />

                  {(returnHint || (suggestCreateLabel && !suggestCreateExactExists) || navStack.length > 0) && (
                    <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                      {navStack.length > 0 ? (
                        <button
                          type="button"
                          onClick={popNavStack}
                          className="rounded-full bg-surface px-2 py-0.5 text-brand hover:underline"
                        >
                          ← 返回{navStack[navStack.length - 1]?.label}
                        </button>
                      ) : null}
                      {returnHint ? (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-ink/55">
                          来自{returnHint}
                        </span>
                      ) : null}
                      {suggestCreateLabel && !suggestCreateExactExists && canCreateAsset ? (
                        <>
                          <span className="min-w-0 flex-1 truncate">
                            建议建档「{suggestCreateLabel}」（不会自动写入库，需确认）
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCreate(suggestCreateLabel)}
                            className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white"
                          >
                            立即新建
                          </button>
                          <button
                            type="button"
                            onClick={() => setSuggestCreateLabel(null)}
                            className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-ink/50"
                          >
                            忽略
                          </button>
                        </>
                      ) : returnHint ? (
                        <span className="text-ink/45">补齐后可关闭素材库，返回继续设定就绪检查</span>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}

              {scope === 'private' && !activeId ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <FolderLock size={36} className="text-brand/50 mb-3" />
                  <p className="text-sm text-ink/55">请先在画布顶部打开一个私有项目</p>
                </div>
              ) : (
                <>
                  {!shellFullEdit ? (
                    <>
                      <div className="shrink-0 px-4 py-2 border-b border-line flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search
                            size={14}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30"
                          />
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`搜索${ASSET_LIBRARY_TABS.find((t) => t.key === tab)?.label ?? ''}…`}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-line"
                          />
                        </div>
                        <span className="text-[10px] text-ink/40 shrink-0">{filtered.length} 项</span>
                        {(tab === 'shot' || tab === 'style' || tab === 'sound') && (
                          <button
                            type="button"
                            onClick={() => setFavoriteOnly((v) => !v)}
                            className={`shrink-0 text-[10px] px-2 py-1 rounded-lg border ${
                              favoriteOnly
                                ? 'border-brand/40 bg-brand/10 text-brand'
                                : 'border-line text-ink/50'
                            }`}
                          >
                            仅收藏
                          </button>
                        )}
                        {tab === 'costume' && scope === 'private' && canEditPrivate && (
                          <button
                            type="button"
                            disabled={costumeGenBusy || workspaceItems.filter((i) => i.kind === 'costume').length === 0}
                            onClick={() => void generateCostumeSheets(workspaceItems.filter((i) => i.kind === 'costume'))}
                            className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/5 text-brand disabled:opacity-45"
                            title="批量生成当前私有库全部服装设定板"
                          >
                            {costumeGenBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {costumeGenBusy ? (costumeGenProgress || '生成中') : '批量设定板'}
                          </button>
                        )}
                        {canCreateAsset && (
                          <button
                            type="button"
                            onClick={() => handleCreate()}
                            className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand text-white"
                          >
                            <Plus size={14} />
                            {tabMeta.newLabel}
                          </button>
                        )}
                      </div>

                      {costumeGenBusy ? (
                        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                          服装设定板生成中 {costumeGenProgress || ''} · 请稍候
                        </div>
                      ) : null}
                      {tab === 'shot' ? (
                        <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
                          <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
                            {/* 左上：体系 */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                                体系
                              </span>
                              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShotSystemId('all');
                                    setShotCategory('all');
                                  }}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    shotSystemId === 'all'
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  全部
                                </button>
                                {SHOT_LEXICON_SYSTEMS.map((sys) => (
                                  <button
                                    key={sys.id}
                                    type="button"
                                    title={sys.fullName}
                                    onClick={() => {
                                      setShotSystemId(sys.id);
                                      setShotCategory('all');
                                    }}
                                    className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                      shotSystemId === sys.id
                                        ? 'border-brand/40 bg-brand/10 text-brand'
                                        : 'border-line text-ink/55 hover:border-brand/30'
                                    }`}
                                  >
                                    {sys.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 右上：分类（全部固定，其余拖拽横滑） */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                                分类
                              </span>
                              <div className="flex min-w-0 flex-1 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setShotCategory('all')}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    shotCategory === 'all'
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  全部
                                </button>
                                <ShotFilterChipScroller deps={shotCategoryOptions.join('|')}>
                                  {shotCategoryOptions.map((cat) => (
                                    <button
                                      key={cat}
                                      type="button"
                                      title={cat}
                                      onClick={() => setShotCategory(cat)}
                                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                        shotCategory === cat
                                          ? 'border-brand/40 bg-brand/10 text-brand'
                                          : 'border-line text-ink/55 hover:border-brand/30'
                                      }`}
                                    >
                                      {shortenShotLexiconCategory(cat)}
                                    </button>
                                  ))}
                                </ShotFilterChipScroller>
                              </div>
                            </div>

                            {/* 左下：运镜 */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                                运镜
                              </span>
                              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                                <button
                                  type="button"
                                  onClick={() => setShotMoveFamily('all')}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    shotMoveFamily === 'all'
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  全部
                                </button>
                                {SHOT_MOVE_FAMILIES.map((fam) => (
                                  <button
                                    key={fam.id}
                                    type="button"
                                    onClick={() => setShotMoveFamily(fam.id)}
                                    className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                      shotMoveFamily === fam.id
                                        ? 'border-brand/40 bg-brand/10 text-brand'
                                        : 'border-line text-ink/55 hover:border-brand/30'
                                    }`}
                                  >
                                    {fam.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 右下：景别 */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                                景别
                              </span>
                              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                                <button
                                  type="button"
                                  onClick={() => setShotSizeFilter('all')}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    shotSizeFilter === 'all'
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  全部
                                </button>
                                {CAC_SHOT_SIZES.map((size) => (
                                  <button
                                    key={size}
                                    type="button"
                                    onClick={() => setShotSizeFilter(size)}
                                    className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                      shotSizeFilter === size
                                        ? 'border-brand/40 bg-brand/10 text-brand'
                                        : 'border-line text-ink/55 hover:border-brand/30'
                                    }`}
                                  >
                                    {size}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {tab === 'style' ? (
                        <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                              美学
                            </span>
                            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                              <button
                                type="button"
                                onClick={() => setStyleFamilyFilter('all')}
                                className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                  styleFamilyFilter === 'all'
                                    ? 'border-brand/40 bg-brand/10 text-brand'
                                    : 'border-line text-ink/55 hover:border-brand/30'
                                }`}
                              >
                                全部
                              </button>
                              {STYLE_AESTHETIC_FAMILIES.map((fam) => (
                                <button
                                  key={fam.id}
                                  type="button"
                                  title={fam.hint}
                                  onClick={() => setStyleFamilyFilter(fam.id)}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    styleFamilyFilter === fam.id
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  {fam.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {tab === 'sound' ? (
                        <div className="nx9-shot-filter shrink-0 border-b border-line px-4 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-7 shrink-0 text-[10px] font-medium text-ink/40">
                              类型
                            </span>
                            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto nx9-scroll">
                              <button
                                type="button"
                                onClick={() => setSoundKindFilter('all')}
                                className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                  soundKindFilter === 'all'
                                    ? 'border-brand/40 bg-brand/10 text-brand'
                                    : 'border-line text-ink/55 hover:border-brand/30'
                                }`}
                              >
                                全部
                              </button>
                              {SOUND_ASSET_KINDS.map((kind) => (
                                <button
                                  key={kind.id}
                                  type="button"
                                  title={kind.hint}
                                  onClick={() => setSoundKindFilter(kind.id)}
                                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] leading-5 ${
                                    soundKindFilter === kind.id
                                      ? 'border-brand/40 bg-brand/10 text-brand'
                                      : 'border-line text-ink/55 hover:border-brand/30'
                                  }`}
                                >
                                  {kind.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {charSheetGenBusy ? (
                        <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                          角色设定板生成/裁切中 {charSheetGenProgress || ''} · 完成后自动回填各参考格
                        </div>
                      ) : null}
                    </>
                  ) : charSheetGenBusy ? (
                    <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                      角色设定板生成/裁切中 {charSheetGenProgress || ''} · 完成后自动回填各参考格
                    </div>
                  ) : costumeGenBusy && entityFullEdit ? (
                    <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                      服装设定板生成中 {costumeGenProgress || ''} · 请稍候
                    </div>
                  ) : (sceneGenBusy || propGenBusy) && entityFullEdit ? (
                    <div className="shrink-0 px-4 py-1.5 text-[11px] text-brand bg-brand/5 border-b border-brand/15">
                      {sceneGenBusy ? '场景空间设定板生成中' : '道具三视图板生成中'} · 请稍候
                    </div>
                  ) : null}

                  {tab === 'character' ? (
                    selectedChar ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => setEditId(null)}
                          >
                            <ChevronLeft size={12} className="shrink-0" />
                            返回
                          </button>
                          <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
                            {selectedChar.name}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              void navigator.clipboard.writeText(formatAssetMention('character', selectedChar.name));
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => handleToggleCharacterLock(selectedChar.id)}
                          >
                            {selectedChar.creative?.consistency?.locked ? '解锁' : '锁定'}
                          </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden">
                          <CharacterDetailFields
                            character={selectedChar}
                            onChange={saveCharacter}
                            onRefreshPrompts={() => saveCharacter(refreshCharacterPrompts(selectedChar))}
                            onUploadAudio={(f) => void handleUploadAudio(f, { kind: 'character', id: selectedChar.id })}
                            onUploadView={(view, f) => void handleUploadCharacterView(f, selectedChar, view)}
                            costumeOptions={costumeBindOptions}
                            onGenerateMasterSheet={canWrite ? () => {
                              if (canCreateAsset) void generateCharacterMasterSheet(selectedChar);
                            } : undefined}
                            onGenerateCategorySheets={canWrite ? () => {
                              if (canCreateAsset) void generateCharacterCategorySheets(selectedChar);
                            } : undefined}
                            generatingMasterSheet={charSheetGenBusy}
                            masterSheetProgress={charSheetGenProgress}
                            genSettingsSlot={(
                              <AssetLibraryGenSettings
                                preset="character-sheet"
                                value={characterSheetGen}
                                onChange={setCharacterSheetGen}
                              />
                            )}
                            onPublishAudioToSound={canWrite ? () => {
                              const s = refreshVoicePrompts(
                                newSoundAsset(`${selectedChar.name}·参考音`, 'voice'),
                              );
                              saveSound({
                                ...s,
                                audioUrl: selectedChar.referenceAudioUrl || '',
                                description: `从角色「${selectedChar.name}」参考音发布`,
                              });
                              toastSuccess(`已发布到声音库：${s.name}`);
                              jumpToAsset('sound', s.id, s.name);
                            } : undefined}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
                        <CharacterCardGrid
                          items={filtered}
                          charactersById={charactersById}
                          scope={scope}
                          canDelete={canDeleteItem}
                          emptyHint={tabMeta.emptyHint}
                          onEdit={(id) => setEditId(id)}
                          onDelete={(id) => void handleDelete(id)}
                          onCopyPublic={handleCopyPublicToWorkspace}
                          onCloneBuiltin={handleCloneBuiltin}
                          onCopyMention={(label) => {
                            void navigator.clipboard.writeText(formatAssetMention('character', label));
                            toastSuccess('已复制 @提及');
                          }}
                          onToggleLock={handleToggleCharacterLock}
                        />
                      </div>
                    )
                  ) : ENTITY_CARD_TABS.has(tab) ? (
                    selectedWorkspaceItem ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => setEditId(null)}
                          >
                            <ChevronLeft size={12} className="shrink-0" />
                            返回
                          </button>
                          <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
                            {selectedWorkspaceItem.label}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                formatAssetMention(tab, selectedWorkspaceItem.label),
                              );
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => handleToggleEntityLock(selectedWorkspaceItem.id)}
                          >
                            {tab === 'costume'
                              ? (getCostumeCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
                              : tab === 'prop'
                                ? (getPropCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
                                : (getSceneCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')}
                          </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden">
                          {tab === 'scene' ? (
                            <SceneDetailFields
                              item={selectedWorkspaceItem}
                              onChange={saveWorkspaceItem}
                              onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                              onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                              onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                              onUploadCover={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'coverUrl')}
                              onRemoveRef={(idx) => handleRemoveSceneRef(selectedWorkspaceItem, idx)}
                              propOptions={propBindOptions}
                              onOpenProp={(propId) => {
                                const hit = propBindOptions.find((p) => p.id === propId);
                                jumpToAsset('prop', propId, hit?.label ?? propId);
                              }}
                              onGenerateSheet={
                                canWrite && scope === 'private' && canEditPrivate
                                  ? () => void generateSceneSheet(selectedWorkspaceItem)
                                  : undefined
                              }
                              generatingSheet={sceneGenBusy}
                              generateSheetError={entityGenError}
                              onCropCoverFromSheet={
                                canWrite && scope === 'private' && canEditPrivate
                                  ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                                  : undefined
                              }
                              croppingCover={entityCropBusy}
                              genSettingsSlot={(
                                <AssetLibraryGenSettings
                                  preset="scene"
                                  value={sceneSheetGen}
                                  onChange={setSceneSheetGen}
                                />
                              )}
                              onSuggestCreateProps={
                                canWrite && scope === 'private' && canEditPrivate
                                  ? (names) => suggestCreatePropsFromScene(selectedWorkspaceItem, names)
                                  : undefined
                              }
                            />
                          ) : null}
                          {tab === 'costume' ? (
                            <div className="flex h-full min-h-0 flex-col">
                              {scope === 'public' && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id ? (
                                <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                                  当前为模板预览。请先导入到可编辑库后再改字段与参考图。
                                  <button
                                    type="button"
                                    className="ml-2 text-brand hover:underline"
                                    onClick={() => handleCloneBuiltin(selectedWorkspaceItem.id)}
                                  >
                                    立即导入
                                  </button>
                                </div>
                              ) : null}
                              <div className="min-h-0 flex-1 overflow-hidden">
                                <CostumeDetailFields
                                  item={selectedWorkspaceItem}
                                  onChange={saveWorkspaceItem}
                                  onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                                  onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                                  onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                                  onUploadFrontFlat={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'frontFlatUrl')}
                                  onUploadVariant={(variantId, file) => {
                                    void (async () => {
                                      const res = await api.uploadAsset(file);
                                      const ext = getCostumeCreative(selectedWorkspaceItem);
                                      const variants = (ext.variants ?? []).map((v) =>
                                        v.id === variantId ? { ...v, imageUrl: res.url } : v,
                                      );
                                      saveWorkspaceItem({
                                        ...selectedWorkspaceItem,
                                        creative: { ...ext, variants },
                                      });
                                    })();
                                  }}
                                  onCropFrontFromSheet={
                                    scope === 'private' && canEditPrivate
                                      ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                                      : undefined
                                  }
                                  croppingFront={entityCropBusy}
                                  generatingSheet={costumeGenBusy}
                                  boundCharacterNames={
                                    healthAnalysis.costumeBoundCharacters.get(selectedWorkspaceItem.id) ?? []
                                  }
                                  onOpenCharacter={(name) => {
                                    const hit = characters.find(
                                      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
                                    );
                                    if (hit) jumpToAsset('character', hit.id, hit.name);
                                  }}
                                  genSettingsSlot={(
                                    <AssetLibraryGenSettings
                                      preset="costume-sheet"
                                      value={costumeSheetGen}
                                      onChange={setCostumeSheetGen}
                                    />
                                  )}
                                  onGenerateSheet={
                                    scope === 'private' && canEditPrivate
                                      ? () => {
                                          const isPreviewOnly = Boolean(
                                            selectedWorkspaceItem.sourceTemplateId
                                            && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id
                                            && !workspaceItems.some((w) => w.id === selectedWorkspaceItem.id),
                                          );
                                          if (isPreviewOnly) {
                                            handleCloneBuiltin(selectedWorkspaceItem.id);
                                            appendLog('已导入服装模板，请在导入后的条目上再次点击生成设定板');
                                            return;
                                          }
                                          void generateCostumeSheets([selectedWorkspaceItem]);
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                          {tab === 'prop' ? (
                            <PropDetailFields
                              item={selectedWorkspaceItem}
                              onChange={saveWorkspaceItem}
                              onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                              onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                              onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                              onUploadCover={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'coverUrl')}
                              boundSceneItems={propBoundScenes.get(selectedWorkspaceItem.id) ?? []}
                              onOpenScene={(sceneId) => {
                                const hit = (propBoundScenes.get(selectedWorkspaceItem.id) ?? []).find((s) => s.id === sceneId);
                                jumpToAsset('scene', sceneId, hit?.label ?? sceneId);
                              }}
                              sceneOptions={sceneBindOptions}
                              onToggleLinkedScene={
                                canWrite && scope === 'private'
                                  ? (sceneId, linked) => togglePropLinkedScene(selectedWorkspaceItem, sceneId, linked)
                                  : undefined
                              }
                              onGenerateSheet={
                                canWrite && scope === 'private' && canEditPrivate
                                  ? () => void generatePropSheet(selectedWorkspaceItem)
                                  : undefined
                              }
                              generatingSheet={propGenBusy}
                              onCropCoverFromSheet={
                                canWrite && scope === 'private' && canEditPrivate
                                  ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                                  : undefined
                              }
                              croppingCover={entityCropBusy}
                              genSettingsSlot={(
                                <AssetLibraryGenSettings
                                  preset="costume-sheet"
                                  value={costumeSheetGen}
                                  onChange={setCostumeSheetGen}
                                />
                              )}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
                        <EntityCardGrid
                          kind={tab as EntityCardKind}
                          items={filtered}
                          workspaceById={workspaceById}
                          scope={scope}
                          canDelete={canDeleteItem}
                          emptyHint={tabMeta.emptyHint}
                          unboundCostumeIds={unboundCostumeIds}
                          onEdit={(id) => setEditId(id)}
                          onDelete={(id) => void handleDelete(id)}
                          onCopyPublic={handleCopyPublicToWorkspace}
                          onCloneBuiltin={handleCloneBuiltin}
                          onCopyMention={(label) => {
                            void navigator.clipboard.writeText(formatAssetMention(tab, label));
                            toastSuccess('已复制 @提及');
                          }}
                          onToggleLock={handleToggleEntityLock}
                        />
                      </div>
                    )
                  ) : tab === 'shot' ? (
                    selectedWorkspaceItem ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => setEditId(null)}
                          >
                            <ChevronLeft size={12} className="shrink-0" />
                            返回
                          </button>
                          <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
                            {isBuiltinShotId(selectedWorkspaceItem.id) ? (
                              <span className="mr-1.5 text-[9px] font-normal text-ink/45">内置</span>
                            ) : null}
                            {selectedWorkspaceItem.label}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                formatAssetMention('shot', selectedWorkspaceItem.label),
                              );
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          {isBuiltinShotId(selectedWorkspaceItem.id) ? (
                            <button
                              type="button"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
                              onClick={() => handleCloneBuiltin(selectedWorkspaceItem.id)}
                            >
                              导入副本
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                                onClick={() => handleToggleShotFavorite(selectedWorkspaceItem.id)}
                              >
                                {getShotCreative(selectedWorkspaceItem).favorite ? '取消收藏' : '收藏'}
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                                onClick={() => handleToggleShotLock(selectedWorkspaceItem.id)}
                              >
                                {getShotCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定'}
                              </button>
                            </>
                          )}
                        </div>
                        {isBuiltinShotId(selectedWorkspaceItem.id) ? (
                          <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                            内置镜头只读。请先「导入副本」后再编辑或删除。
                          </div>
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <ShotDetailFields
                            item={selectedWorkspaceItem}
                            onChange={
                              isBuiltinShotId(selectedWorkspaceItem.id)
                                ? () => toastError('内置镜头不可修改，请先导入副本')
                                : saveWorkspaceItem
                            }
                            onRefreshPrompts={
                              isBuiltinShotId(selectedWorkspaceItem.id)
                                ? () => toastError('内置镜头不可修改，请先导入副本')
                                : () => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))
                            }
                            onUploadGif={
                              isBuiltinShotId(selectedWorkspaceItem.id)
                                ? async () => { toastError('内置镜头不可修改，请先导入副本'); }
                                : (f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'gifUrl')
                            }
                            onUploadExample={
                              isBuiltinShotId(selectedWorkspaceItem.id)
                                ? async () => { toastError('内置镜头不可修改，请先导入副本'); }
                                : (f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'exampleImageUrl')
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
                        <ShotCardGrid
                          items={filtered}
                          workspaceById={workspaceById}
                          canDelete={canDeleteItem}
                          emptyHint={
                            shotSystemId !== 'all'
                            || shotCategory !== 'all'
                            || shotMoveFamily !== 'all'
                            || shotSizeFilter !== 'all'
                            || favoriteOnly
                            || query.trim()
                              ? '无匹配镜头 · 清除筛选后再试'
                              : tabMeta.emptyHint
                          }
                          onEdit={handleEditShot}
                          onDelete={(id) => void handleDelete(id)}
                          onCloneBuiltin={handleCloneBuiltin}
                          onCopyMention={(label) => {
                            void navigator.clipboard.writeText(formatAssetMention('shot', label));
                            toastSuccess('已复制 @提及');
                          }}
                          onToggleLock={handleToggleShotLock}
                          onToggleFavorite={handleToggleShotFavorite}
                        />
                      </div>
                    )
                  ) : tab === 'style' ? (
                    selectedStyle ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => setEditId(null)}
                          >
                            <ChevronLeft size={12} className="shrink-0" />
                            返回
                          </button>
                          <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
                            {isBuiltinStylePreset(selectedStyle) ? (
                              <span className="mr-1.5 text-[9px] font-normal text-ink/45">内置</span>
                            ) : null}
                            {selectedStyle.name}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                formatAssetMention('style', selectedStyle.name),
                              );
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          {isBuiltinStylePreset(selectedStyle) ? (
                            <button
                              type="button"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
                              onClick={() => handleCloneBuiltin(selectedStyle.id)}
                            >
                              导入副本
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                              onClick={() => handleToggleStyleFavorite(selectedStyle.id)}
                            >
                              {selectedStyle.favorite ? '取消收藏' : '收藏'}
                            </button>
                          )}
                        </div>
                        {isBuiltinStylePreset(selectedStyle) ? (
                          <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                            内置风格只读。请先「导入副本」后再编辑或删除。
                          </div>
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <StyleDetailFields
                            style={selectedStyle}
                            readOnly={scope !== 'public' || isBuiltinStylePreset(selectedStyle)}
                            onChange={handleSaveStyle}
                            onUploadReference={
                              scope === 'public' && !isBuiltinStylePreset(selectedStyle)
                                ? (file) => {
                                    void (async () => {
                                      const res = await api.uploadAsset(file);
                                      publicUpsertStyle({
                                        ...selectedStyle,
                                        referenceImageUrl: res.url,
                                      });
                                    })();
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
                        <StyleCardGrid
                          items={filtered}
                          stylesById={stylesById}
                          canDelete={canDeleteItem}
                          emptyHint={
                            styleFamilyFilter !== 'all' || favoriteOnly || query.trim()
                              ? '无匹配风格 · 清除筛选后再试'
                              : tabMeta.emptyHint
                          }
                          onEdit={handleEditStyle}
                          onDelete={(id) => void handleDelete(id)}
                          onCloneBuiltin={handleCloneBuiltin}
                          onCopyMention={(label) => {
                            void navigator.clipboard.writeText(formatAssetMention('style', label));
                            toastSuccess('已复制 @提及');
                          }}
                          onToggleFavorite={handleToggleStyleFavorite}
                        />
                      </div>
                    )
                  ) : tab === 'sound' ? (
                    selectedSound ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="nx9-asset-lib-sticky flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-4">
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-0.5 rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => setEditId(null)}
                          >
                            <ChevronLeft size={12} className="shrink-0" />
                            返回
                          </button>
                          <span className="flex min-h-0 min-w-0 flex-1 items-center truncate text-xs font-semibold leading-none text-ink">
                            {isBuiltinSoundAsset(selectedSound) ? (
                              <span className="mr-1.5 text-[9px] font-normal text-ink/45">内置</span>
                            ) : null}
                            {selectedSound.name}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                formatAssetMention('sound', selectedSound.name),
                              );
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          {isBuiltinSoundAsset(selectedSound) ? (
                            <button
                              type="button"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
                              onClick={() => handleCloneBuiltin(selectedSound.id)}
                            >
                              导入副本
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                              onClick={() => handleToggleSoundFavorite(selectedSound.id)}
                            >
                              {isSoundFavorite(selectedSound) ? '取消收藏' : '收藏'}
                            </button>
                          )}
                        </div>
                        {isBuiltinSoundAsset(selectedSound) ? (
                          <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                            内置声音只读。请先「导入副本」后再编辑或删除。
                          </div>
                        ) : null}
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <VoiceDetailFields
                            sound={selectedSound}
                            readOnly={isBuiltinSoundAsset(selectedSound)}
                            onChange={saveSound}
                            onRefreshPrompts={() => saveSound(refreshVoicePrompts(selectedSound))}
                            onUploadAudio={
                              !isBuiltinSoundAsset(selectedSound)
                                ? (f) => void handleUploadAudio(f, { kind: 'sound', id: selectedSound.id })
                                : undefined
                            }
                            onSetAsCharacterReference={
                              !isBuiltinSoundAsset(selectedSound)
                              && characters.length
                              && selectedSound.audioUrl
                                ? () => {
                                    const target = characters[0];
                                    if (!target) return;
                                    saveCharacter({
                                      ...target,
                                      referenceAudioUrl: selectedSound.audioUrl,
                                    });
                                    toastSuccess(
                                      `已将「${selectedSound.name}」设为角色「${target.name}」参考音（可在角色详情改绑）`,
                                    );
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
                        <SoundCardGrid
                          items={filtered}
                          soundsById={soundsById}
                          canDelete={canDeleteItem}
                          emptyHint={
                            soundKindFilter !== 'all' || favoriteOnly || query.trim()
                              ? '无匹配声音 · 清除筛选后再试'
                              : tabMeta.emptyHint
                          }
                          onEdit={handleEditSound}
                          onDelete={(id) => void handleDelete(id)}
                          onCloneBuiltin={handleCloneBuiltin}
                          onCopyMention={(label) => {
                            void navigator.clipboard.writeText(formatAssetMention('sound', label));
                            toastSuccess('已复制 @提及');
                          }}
                          onToggleFavorite={handleToggleSoundFavorite}
                        />
                      </div>
                    )
                  ) : (
                  <div className="flex-1 flex min-h-0">
                    <ul className="w-52 shrink-0 border-r border-line overflow-y-auto nx9-scroll p-2 space-y-0.5">
                      {filtered.length === 0 && (
                        <li className="text-[11px] text-ink/40 p-3 text-center">{tabMeta.emptyHint}</li>
                      )}
                      {filtered.map((item) => (
                        <li key={item.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => setEditId(item.id)}
                            className={`flex w-full items-center gap-2 text-left text-xs px-2 py-1.5 rounded-lg pr-8 ${
                              editId === item.id
                                ? 'bg-brand/10 text-brand'
                                : 'hover:bg-surface text-ink/80'
                            }`}
                          >
                            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                              ) : item.audioUrl ? (
                                <span className="grid h-full w-full place-items-center text-[9px] text-ink/35">音</span>
                              ) : (
                                <span className="grid h-full w-full place-items-center text-[9px] text-ink/25">—</span>
                              )}
                              {!item.imageUrl && !item.audioUrl ? (
                                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warn" title="缺媒体" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {item.builtin && (
                                <span className="text-[9px] text-ink/30 mr-1">内置</span>
                              )}
                              {item.label}
                            </span>
                          </button>
                          {item.builtin ? (
                            <button
                              type="button"
                              title="导入到当前库并编辑"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloneBuiltin(item.id);
                              }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] text-brand/80 hover:bg-brand/10 opacity-0 group-hover:opacity-100"
                            >
                              导入
                            </button>
                          ) : scope === 'public' ? (
                            <button
                              type="button"
                              title="复制到项目私有库"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyPublicToWorkspace(item.id);
                              }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] text-accent/80 hover:bg-accent/10 opacity-0 group-hover:opacity-100"
                            >
                              复制到项目
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canDeleteItem) void handleDelete(item.id);
                              }}
                              className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded ${canDeleteItem ? 'text-ink/30 hover:text-red-600 opacity-0 group-hover:opacity-100' : 'text-ink/10 cursor-not-allowed'}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="flex-1 overflow-y-auto nx9-scroll p-4">
                      {!editId && (
                        <p className="text-sm text-ink/40 text-center mt-12">选择或新建素材进行编辑</p>
                      )}

                      {editId && selectedWorkspaceItem && (
                        <div className="nx9-asset-lib-sticky sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                            {selectedWorkspaceItem.label}
                          </span>
                          <button
                            type="button"
                            className="rounded-lg border border-line px-2 py-1 text-[10px] text-ink/60 hover:border-brand/40"
                            onClick={() => {
                              const label = selectedWorkspaceItem.label || '';
                              const kind = tab;
                              void navigator.clipboard.writeText(formatAssetMention(kind, label));
                              toastSuccess('已复制 @提及');
                            }}
                          >
                            复制 @
                          </button>
                          {tab === 'emotion' && (
                            <button
                              type="button"
                              className="rounded-lg border border-line px-2 py-1 text-[10px] text-ink/60 hover:border-brand/40"
                              onClick={() => {
                                const item = selectedWorkspaceItem;
                                const ext = getEmotionCreative(item);
                                const locked = !ext.locked;
                                const prompt = item.promptEn?.trim() || ext.prompts?.emotion?.text?.trim() || '';
                                saveWorkspaceItem({
                                  ...item,
                                  creative: {
                                    ...ext,
                                    locked,
                                    lockedPromptSnapshot: locked ? prompt : ext.lockedPromptSnapshot,
                                    lockedAt: locked ? new Date().toISOString() : ext.lockedAt,
                                  },
                                });
                              }}
                            >
                              {getEmotionCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定'}
                            </button>
                          )}
                        </div>
                      )}

                      {tab === 'emotion' && selectedWorkspaceItem && (
                        <div className="space-y-2">
                          <p className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5 text-[10px] text-ink/60">
                            情绪库已降级。新氛围标签请在镜头「推荐情绪」维护；角色微表情请用角色表情格。
                          </p>
                          <EmotionDetailFields
                            item={selectedWorkspaceItem}
                            onChange={saveWorkspaceItem}
                            onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                            onUploadImage={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'imageUrl')}
                          />
                        </div>
                      )}

                      {scope === 'private' && selectedWorkspaceItem && (
                        <button
                          type="button"
                          onClick={promoteToPublic}
                          className="mt-4 text-xs text-accent hover:underline"
                        >
                          复制到公共库
                        </button>
                      )}
                    </div>
                  </div>
                  )}
                </>
              )}
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}


