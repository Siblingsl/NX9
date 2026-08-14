import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  AssetLibraryKind,
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  assetLibraryTabGroupsForScope,
  isAssetLibraryNavKindForScope,
  isAssetLibraryPublicOnlyKind,
} from '@nx9/shared';
import { type HealthIssueKey } from '../../../engine/asset-library-health';
import { useAssetLibraryModalUi } from '../../../stores/asset-library-modal-ui';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { toastSuccess } from '../../../stores/toast';
import { useWorkspaceDocument } from '../../../stores/workspace-document';

export type AssetLibraryModalNavStackEntry = {
  tab: AssetLibraryKind;
  itemId: string;
  label: string;
};

export type AssetLibraryNavigationDeps = {
  editId: string | null;
  tab: AssetLibraryKind;
  scope: AssetScope;
  selectedChar: CharacterProfile | undefined;
  selectedSound: SoundAssetProfile | undefined;
  selectedWorkspaceItem: BacklotWorkspaceItem | undefined;
  setTab: (tab: AssetLibraryKind) => void;
  setScope: (scope: AssetScope) => void;
  setEditId: Dispatch<SetStateAction<string | null>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setHealthFilterKey: Dispatch<SetStateAction<HealthIssueKey | null>>;
  setNavStack: Dispatch<SetStateAction<AssetLibraryModalNavStackEntry[]>>;
};

export function useAssetLibraryNavigation(deps: AssetLibraryNavigationDeps) {
  const {
    editId,
    tab,
    scope,
    selectedChar,
    selectedSound,
    selectedWorkspaceItem,
    setTab,
    setScope,
    setEditId,
    setQuery,
    setHealthFilterKey,
    setNavStack,
  } = deps;

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
    [editId, tab, selectedChar, selectedSound, selectedWorkspaceItem, setTab, setEditId, setQuery, setHealthFilterKey, setNavStack],
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
  }, [setNavStack, setTab, setEditId, setQuery]);

  const handleScopeChange = useCallback(
    (next: AssetScope) => {
      const prevTab = useAssetLibraryModalUi.getState().tab;
      const prevEditId = editId;
      setScope(next);
      if (!isAssetLibraryNavKindForScope(prevTab, next)) {
        const fallback = assetLibraryTabGroupsForScope(next)[0]?.keys[0] ?? 'character';
        setTab(fallback);
        setEditId(null);
        if (isAssetLibraryPublicOnlyKind(prevTab) && next === 'private') {
          toastSuccess('镜头/风格仅在公共库；已切回可见 Tab');
        }
        return;
      }
      // P1′ UX-P06：尽量保留同 id 编辑态；目标库没有则回列表
      if (prevEditId) {
        window.setTimeout(() => {
          const st = useWorkspaceDocument.getState();
          const pub = usePublicAssetLibrary.getState().payload;
          if (next === 'private') {
            const hitChar = st.characters.characters.find((c) => c.id === prevEditId && !c.deletedAt);
            const hitWs = st.backlotWorkspace.items.find((i) => i.id === prevEditId && !i.deletedAt);
            if (!hitChar && !hitWs) setEditId(null);
          } else {
            const hitChar = pub.characters.some((c) => c.id === prevEditId);
            const hitTpl = pub.templates.some((t) => t.id === prevEditId);
            if (!hitChar && !hitTpl) setEditId(null);
          }
        }, 0);
      }
    },
    [setScope, setTab, editId, setEditId],
  );

  return {
    jumpToAsset,
    popNavStack,
    handleScopeChange,
  };
}
