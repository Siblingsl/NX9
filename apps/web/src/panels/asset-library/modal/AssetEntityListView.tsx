import { formatAssetMention } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { AssetBatchBar } from '../AssetBatchBar';
import { EntityCardGrid, type EntityCardKind } from '../EntityCardGrid';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetEntityListView() {
  const {
    batchEnabled,
    selectedIds,
    selectableBatchIds,
    canDeleteItem,
    selectAllBatch,
    clearBatchSelection,
    handleBatchSetLock,
    handleBatchDelete,
    tab,
    filtered,
    workspaceById,
    scope,
    tabMeta,
    unboundCostumeIds,
    toggleBatchSelect,
    setEditId,
    handleDelete,
    handleCopyPublicToWorkspace,
    handleCloneBuiltin,
    handleToggleEntityLock,
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
      <EntityCardGrid
        kind={tab as EntityCardKind}
        items={filtered}
        workspaceById={workspaceById}
        scope={scope}
        canDelete={canDeleteItem}
        emptyHint={tabMeta.emptyHint}
        unboundCostumeIds={unboundCostumeIds}
        selectedIds={batchEnabled ? selectedIds : undefined}
        onToggleSelect={batchEnabled ? toggleBatchSelect : undefined}
        onEdit={(id) => setEditId(id)}
        onDelete={(id) => void handleDelete(id)}
        onCopyPublic={handleCopyPublicToWorkspace}
        onCloneBuiltin={handleCloneBuiltin}
        onCopyMention={(label) => {
          void navigator.clipboard.writeText(formatAssetMention(tab, label));
          toastSuccess('已复制 @提及');
        }}
        onToggleLock={handleToggleEntityLock}
        onPublishToPublic={
          scope === 'private' && canWrite
            ? (id) => void handlePublishToPublic(id)
            : undefined
        }
      />
    </div>
  );
}
