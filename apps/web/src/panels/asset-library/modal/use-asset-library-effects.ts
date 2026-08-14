import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AssetLibraryKind, AssetScope, ShotMoveFamily } from '@nx9/shared';
import { isAssetLibraryPublicOnlyKind } from '@nx9/shared';
import { sceneCandidateToWorkspaceItem } from '../../../engine/script-asset-candidates';
import { type HealthIssueKey } from '../../../engine/asset-library-health';
import { useAssetLibraryModalUi, type AssetLibraryNavigateRequest } from '../../../stores/asset-library-modal-ui';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { useWorkspaceCatalog } from '../../../stores/workspace-catalog';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { getSceneCreative } from '@nx9/shared';
import { normalizeName } from './meta';

export type AssetLibraryModalEffectsDeps = {
  open: boolean;
  scope: AssetScope;
  tab: AssetLibraryKind;
  editId: string | null;
  navigateRequest: AssetLibraryNavigateRequest | null;
  canEditPrivate: boolean;
  activeId: string | null;
  setEditId: Dispatch<SetStateAction<string | null>>;
  setTab: (tab: AssetLibraryKind) => void;
  setScope: (scope: AssetScope) => void;
  setQuery: Dispatch<SetStateAction<string>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setSuggestCreateLabel: Dispatch<SetStateAction<string | null>>;
  setReturnHint: Dispatch<SetStateAction<string | null>>;
  setResumeGapKey: Dispatch<SetStateAction<string | null>>;
  setResumeSection: Dispatch<SetStateAction<'characters' | 'scenes' | 'costumes' | 'props' | null>>;
  setHealthFilterKey: Dispatch<SetStateAction<HealthIssueKey | null>>;
  setShotSystemId: Dispatch<SetStateAction<string | 'all'>>;
  setShotCategory: Dispatch<SetStateAction<string | 'all'>>;
  setShotMoveFamily: Dispatch<SetStateAction<ShotMoveFamily | 'all'>>;
  setShotSizeFilter: Dispatch<SetStateAction<string | 'all'>>;
  setFavoriteOnly: Dispatch<SetStateAction<boolean>>;
};

export function useAssetLibraryModalEffects(deps: AssetLibraryModalEffectsDeps) {
  const {
    open,
    scope,
    tab,
    editId,
    navigateRequest,
    canEditPrivate,
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
  } = deps;

  const fetchPublic = usePublicAssetLibrary((s) => s.fetch);
  const selectWorkspace = useWorkspaceCatalog((s) => s.selectWorkspace);
  const clearNavigateRequest = useAssetLibraryModalUi((s) => s.clearNavigateRequest);
  const environmentLibrary = useWorkspaceDocument((s) => s.environments);
  const upsertBacklotWorkspace = useWorkspaceDocument((s) => s.upsertBacklotWorkspace);

  useEffect(() => {
    if (open) void fetchPublic();
  }, [open, fetchPublic]);

  /** P-18：切 Tab / Scope / 进入详情时清空多选 */
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, scope, editId, setSelectedIds]);

  /** P1′ UX-P11：进编辑后锚到视觉/媒体区（缺图优先入口） */
  useEffect(() => {
    if (!editId) return;
    const timer = window.setTimeout(() => {
      const root = document.querySelector('.nx9-asset-library-modal');
      if (!root) return;
      const prefer = root.querySelector(
        '#char-visual, #costume-core, #scene-space, #prop-archive, [data-asset-media-anchor]',
      );
      prefer?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [editId, tab]);

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
  }, [open, tab, editId, scope, setTab, setEditId]);

  useEffect(() => {
    if (!open || !navigateRequest) return;
    const nextScope =
      navigateRequest.scope
      ?? (isAssetLibraryPublicOnlyKind(navigateRequest.tab) ? 'public' : undefined);
    if (nextScope) setScope(nextScope);
    setTab(navigateRequest.tab);
    setSuggestCreateLabel(navigateRequest.suggestCreateLabel?.trim() || null);
    setReturnHint(navigateRequest.returnHint?.trim() || null);
    setResumeGapKey(
      navigateRequest.resumeGapKey?.trim()
      || navigateRequest.suggestCreateLabel?.trim()
      || navigateRequest.query?.trim()
      || null,
    );
    setResumeSection(navigateRequest.resumeSection ?? null);
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
    setEditId,
    setQuery,
    setSuggestCreateLabel,
    setReturnHint,
    setResumeGapKey,
    setResumeSection,
    selectWorkspace,
    clearNavigateRequest,
  ]);

  useEffect(() => {
    if (!open) {
      setSuggestCreateLabel(null);
      setReturnHint(null);
    }
  }, [open, setSuggestCreateLabel, setReturnHint]);

  useEffect(() => {
    setHealthFilterKey(null);
    setShotSystemId('all');
    setShotCategory('all');
    setShotMoveFamily('all');
    setShotSizeFilter('all');
    if (tab !== 'shot') setFavoriteOnly(false);
  }, [
    tab,
    scope,
    setHealthFilterKey,
    setShotSystemId,
    setShotCategory,
    setShotMoveFamily,
    setShotSizeFilter,
    setFavoriteOnly,
  ]);

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
}
