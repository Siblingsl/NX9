import { ENTITY_CARD_TABS } from './meta';
import { useAssetLibraryModal } from './AssetLibraryModalContext';
import { AssetDetailCharacterView } from './AssetDetailCharacterView';
import { AssetDetailEntityView } from './AssetDetailEntityView';
import { AssetDetailShotView } from './AssetDetailShotView';
import { AssetDetailSoundView } from './AssetDetailSoundView';
import { AssetDetailStyleView } from './AssetDetailStyleView';
import { AssetCharacterListView } from './AssetCharacterListView';
import { AssetEntityListView } from './AssetEntityListView';
import { AssetLibraryLegacyView } from './AssetLibraryLegacyView';
import { AssetShotListView } from './AssetShotListView';
import { AssetSoundListView } from './AssetSoundListView';
import { AssetStyleListView } from './AssetStyleListView';

export function AssetLibraryMainView() {
  const { tab, selectedChar, selectedWorkspaceItem, selectedStyle, selectedSound } =
    useAssetLibraryModal();

  if (tab === 'character') {
    return selectedChar ? <AssetDetailCharacterView /> : <AssetCharacterListView />;
  }
  if (ENTITY_CARD_TABS.has(tab)) {
    return selectedWorkspaceItem ? <AssetDetailEntityView /> : <AssetEntityListView />;
  }
  if (tab === 'shot') {
    return selectedWorkspaceItem ? <AssetDetailShotView /> : <AssetShotListView />;
  }
  if (tab === 'style') {
    return selectedStyle ? <AssetDetailStyleView /> : <AssetStyleListView />;
  }
  if (tab === 'sound') {
    return selectedSound ? <AssetDetailSoundView /> : <AssetSoundListView />;
  }
  return <AssetLibraryLegacyView />;
}
