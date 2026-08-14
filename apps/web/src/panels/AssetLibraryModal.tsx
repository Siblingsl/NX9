/**
 * A11（DEEP-11）：素材库 Modal 巨石拆分入口壳。
 * 控制器（状态/选择/动作/生成/导航/副作用）与壳层/列表/详情 JSX 均迁至
 * ./asset-library/modal/，本文件仅保留 AppShell 依赖的模块入口与导出名。
 */
import { AssetLibraryModalProvider } from './asset-library/modal/AssetLibraryModalContext';
import { AssetLibraryModalShell } from './asset-library/modal/AssetLibraryModalShell';
import { useAssetLibraryModalController } from './asset-library/modal/use-asset-library-modal-controller';

export function AssetLibraryModal() {
  const controller = useAssetLibraryModalController();
  if (!controller.open) return null;
  return (
    <AssetLibraryModalProvider value={controller}>
      <AssetLibraryModalShell />
    </AssetLibraryModalProvider>
  );
}
