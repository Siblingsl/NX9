import { AssetLibraryMainView } from './AssetLibraryMainView';
import { AssetLibraryStatusRail } from './AssetLibraryStatusRail';

export function AssetLibraryModalContent() {
  return (
    <>
      <AssetLibraryStatusRail />
      <AssetLibraryMainView />
    </>
  );
}
