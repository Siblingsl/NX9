import { formatAssetMention } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { ShotCardGrid } from '../ShotCardGrid';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetShotListView() {
  const {
    filtered,
    workspaceById,
    canDeleteItem,
    shotSystemId,
    shotCategory,
    shotMoveFamily,
    shotSizeFilter,
    favoriteOnly,
    query,
    tabMeta,
    handleEditShot,
    handleDelete,
    handleCloneBuiltin,
    handleToggleShotLock,
    handleToggleShotFavorite,
  } = useAssetLibraryModal();

  return (
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
  );
}
