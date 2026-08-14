import { formatAssetMention } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { AssetBatchBar } from '../AssetBatchBar';
import { CharacterCardGrid } from '../CharacterCardGrid';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetCharacterListView() {
  const {
    batchEnabled,
    selectedIds,
    selectableBatchIds,
    canDeleteItem,
    selectAllBatch,
    clearBatchSelection,
    handleBatchSetLock,
    handleBatchDelete,
    filtered,
    charactersById,
    scope,
    tabMeta,
    toggleBatchSelect,
    setEditId,
    handleDelete,
    handleCopyPublicToWorkspace,
    handleCloneBuiltin,
    handleToggleCharacterLock,
    canWrite,
    handlePublishToPublic,
  } = useAssetLibraryModal();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto nx9-scroll p-4">
      {batchEnabled ? (
        <AssetBatchBar
          count={selectedIds.size}
          totalSelectable={selectableBatchIds.length}
          canDelete={canDeleteItem}
          onSelectAll={selectAllBatch}
          onClear={clearBatchSelection}
          onLock={() => handleBatchSetLock(true)}
          onUnlock={() => handleBatchSetLock(false)}
          onDelete={() => void handleBatchDelete()}
        />
      ) : null}
      <CharacterCardGrid
        items={filtered}
        charactersById={charactersById}
        scope={scope}
        canDelete={canDeleteItem}
        emptyHint={tabMeta.emptyHint}
        selectedIds={batchEnabled ? selectedIds : undefined}
        onToggleSelect={batchEnabled ? toggleBatchSelect : undefined}
        onEdit={(id) => setEditId(id)}
        onDelete={(id) => void handleDelete(id)}
        onCopyPublic={handleCopyPublicToWorkspace}
        onCloneBuiltin={handleCloneBuiltin}
        onCopyMention={(label) => {
          void navigator.clipboard.writeText(formatAssetMention('character', label));
          toastSuccess('已复制 @提及');
        }}
        onToggleLock={handleToggleCharacterLock}
        onPublishToPublic={
          scope === 'private' && canWrite
            ? (id) => void handlePublishToPublic(id)
            : undefined
        }
      />
    </div>
  );
}
