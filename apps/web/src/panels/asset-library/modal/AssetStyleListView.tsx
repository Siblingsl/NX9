import { formatAssetMention } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { StyleCardGrid } from '../StyleCardGrid';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetStyleListView() {
  const {
    filtered,
    stylesById,
    canDeleteItem,
    styleFamilyFilter,
    favoriteOnly,
    query,
    tabMeta,
    handleEditStyle,
    handleDelete,
    handleCloneBuiltin,
    handleToggleStyleFavorite,
  } = useAssetLibraryModal();

  return (
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
  );
}
