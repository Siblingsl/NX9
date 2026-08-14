import { useState } from 'react';
import type {
  AssetLibraryKind,
  AssetScope,
  ShotMoveFamily,
  SoundAssetKind,
  StyleAestheticFamily,
} from '@nx9/shared';
import { useLibraryAcl } from '../../../engine/use-library-acl';
import { type HealthIssueKey } from '../../../engine/asset-library-health';
import { useAssetLibraryModalUi } from '../../../stores/asset-library-modal-ui';
import { useAssetLibraryGenSettings } from '../../../stores/asset-library-gen-settings';
import { useActivityLog } from '../../../stores/activity-log';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { useWorkspaceCatalog } from '../../../stores/workspace-catalog';
import { useAssetLibraryActionsCore } from './use-asset-library-actions-core';
import { useAssetLibraryCatalog } from './use-asset-library-catalog';
import { useAssetLibraryModalEffects } from './use-asset-library-effects';
import { useAssetLibraryGeneration } from './use-asset-library-generation';
import { useAssetLibraryNavigation } from './use-asset-library-navigation';

export function useAssetLibraryModalController() {
  const open = useAssetLibraryModalUi((s) => s.open);
  const scope = useAssetLibraryModalUi((s) => s.scope);
  const tab = useAssetLibraryModalUi((s) => s.tab);
  const navigateRequest = useAssetLibraryModalUi((s) => s.navigateRequest);
  const setOpen = useAssetLibraryModalUi((s) => s.setOpen);
  const setScope = useAssetLibraryModalUi((s) => s.setScope);
  const setTab = useAssetLibraryModalUi((s) => s.setTab);
  const returnToSource = useAssetLibraryModalUi((s) => s.returnToSource);
  const clearNavigateRequest = useAssetLibraryModalUi((s) => s.clearNavigateRequest);

  const acl = useLibraryAcl(scope);
  const { canRead, canWrite, canDelete: canDeleteItem } = acl;

  const activeId = useWorkspaceCatalog((s) => s.activeId);
  const appendLog = useActivityLog((s) => s.append);
  const publicTemplates = usePublicAssetLibrary((s) => s.payload.templates);

  const [query, setQuery] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [suggestCreateLabel, setSuggestCreateLabel] = useState<string | null>(null);
  const [returnHint, setReturnHint] = useState<string | null>(null);
  const [resumeGapKey, setResumeGapKey] = useState<string | null>(null);
  const [resumeSection, setResumeSection] = useState<
    'characters' | 'scenes' | 'costumes' | 'props' | null
  >(null);
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

  const catalog = useAssetLibraryCatalog({
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
  });

  const core = useAssetLibraryActionsCore({
    scope,
    tab,
    editId,
    canEditPrivate: catalog.canEditPrivate,
    canDeleteItem,
    canWrite,
    selectedIds,
    setSelectedIds,
    setEditId,
    setTab,
    setScope,
    setQuery,
    setSuggestCreateLabel,
    healthAnalysis: catalog.healthAnalysis,
    workspaceById: catalog.workspaceById,
    soundsById: catalog.soundsById,
    stylesById: catalog.stylesById,
    selectableBatchIds: catalog.selectableBatchIds,
  });

  const generation = useAssetLibraryGeneration({
    scope,
    canEditPrivate: catalog.canEditPrivate,
    selectedWorkspaceItem: catalog.selectedWorkspaceItem,
    saveCharacter: core.saveCharacter,
    saveSound: core.saveSound,
    saveWorkspaceItem: core.saveWorkspaceItem,
    setCostumeGenBusy,
    setCostumeGenProgress,
    setSceneGenBusy,
    setPropGenBusy,
    setEntityGenError,
    setEntityCropBusy,
    setCharSheetGenBusy,
    setCharSheetGenProgress,
  });

  const navigation = useAssetLibraryNavigation({
    editId,
    tab,
    scope,
    selectedChar: catalog.selectedChar,
    selectedSound: catalog.selectedSound,
    selectedWorkspaceItem: catalog.selectedWorkspaceItem,
    setTab,
    setScope,
    setEditId,
    setQuery,
    setHealthFilterKey,
    setNavStack,
  });

  useAssetLibraryModalEffects({
    open,
    scope,
    tab,
    editId,
    navigateRequest,
    canEditPrivate: catalog.canEditPrivate,
    activeId,
    setEditId,
    setTab,
    setScope,
    setQuery,
    setSelectedIds,
    setSuggestCreateLabel,
    setReturnHint,
    setResumeGapKey,
    setResumeSection,
    setHealthFilterKey,
    setShotSystemId,
    setShotCategory,
    setShotMoveFamily,
    setShotSizeFilter,
    setFavoriteOnly,
  });

  return {
    open,
    scope,
    tab,
    navigateRequest,
    setOpen,
    setScope,
    setTab,
    returnToSource,
    clearNavigateRequest,
    query,
    setQuery,
    editId,
    setEditId,
    selectedIds,
    setSelectedIds,
    showTrash,
    setShowTrash,
    navStack,
    setNavStack,
    suggestCreateLabel,
    setSuggestCreateLabel,
    returnHint,
    setReturnHint,
    resumeGapKey,
    setResumeGapKey,
    resumeSection,
    setResumeSection,
    healthFilterKey,
    setHealthFilterKey,
    favoriteOnly,
    setFavoriteOnly,
    shotSystemId,
    setShotSystemId,
    shotCategory,
    setShotCategory,
    shotMoveFamily,
    setShotMoveFamily,
    shotSizeFilter,
    setShotSizeFilter,
    styleFamilyFilter,
    setStyleFamilyFilter,
    soundKindFilter,
    setSoundKindFilter,
    appendLog,
    publicTemplates,
    costumeGenBusy,
    setCostumeGenBusy,
    costumeGenProgress,
    setCostumeGenProgress,
    sceneGenBusy,
    setSceneGenBusy,
    propGenBusy,
    setPropGenBusy,
    entityGenError,
    setEntityGenError,
    entityCropBusy,
    setEntityCropBusy,
    charSheetGenBusy,
    setCharSheetGenBusy,
    charSheetGenProgress,
    setCharSheetGenProgress,
    characterSheetGen,
    costumeSheetGen,
    sceneSheetGen,
    setCharacterSheetGen,
    setCostumeSheetGen,
    setSceneSheetGen,
    ...catalog,
    ...core,
    ...generation,
    ...navigation,
  };
}

export type AssetLibraryModalController = ReturnType<typeof useAssetLibraryModalController>;
