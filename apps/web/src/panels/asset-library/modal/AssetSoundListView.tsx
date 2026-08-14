import { formatAssetMention } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { SoundCardGrid } from '../SoundCardGrid';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetSoundListView() {
  const {
    filtered,
    soundsById,
    canDeleteItem,
    soundKindFilter,
    favoriteOnly,
    query,
    tabMeta,
    handleEditSound,
    handleDelete,
    handleCloneBuiltin,
    handleToggleSoundFavorite,
  } = useAssetLibraryModal();

  return (
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
  );
}
