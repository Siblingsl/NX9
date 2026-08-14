import { formatAssetMention, getShotCreative, refreshWorkspacePrompts } from '@nx9/shared';
import { toastError, toastSuccess } from '../../../stores/toast';
import { AssetDetailStickyBar } from '../AssetDetailStickyBar';
import { AssetEditQuickJump } from '../AssetEditQuickJump';
import { ShotDetailFields } from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetDetailShotView() {
  const {
    selectedWorkspaceItem,
    isBuiltinShotId,
    navStack,
    popNavStack,
    handleToggleShotLock,
    handleCloneBuiltin,
    handleToggleShotFavorite,
    canDeleteItem,
    handleDelete,
    filtered,
    setEditId,
    saveWorkspaceItem,
    handleUploadWorkspaceMedia,
  } = useAssetLibraryModal();

  if (!selectedWorkspaceItem) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetDetailStickyBar
        title={`${isBuiltinShotId(selectedWorkspaceItem.id) ? '内置 · ' : ''}${selectedWorkspaceItem.label}`}
        onBackToList={() => setEditId(null)}
        navPrevLabel={navStack.length > 0 ? navStack[navStack.length - 1]?.label : null}
        onBackToPrev={navStack.length > 0 ? popNavStack : undefined}
        onCopyMention={() => {
          void navigator.clipboard.writeText(
            formatAssetMention('shot', selectedWorkspaceItem.label),
          );
          toastSuccess('已复制 @提及');
        }}
        lockLabel={
          isBuiltinShotId(selectedWorkspaceItem.id)
            ? undefined
            : (getShotCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
        }
        onToggleLock={
          isBuiltinShotId(selectedWorkspaceItem.id)
            ? undefined
            : () => handleToggleShotLock(selectedWorkspaceItem.id)
        }
        more={
          isBuiltinShotId(selectedWorkspaceItem.id) ? (
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
              onClick={() => handleCloneBuiltin(selectedWorkspaceItem.id)}
            >
              导入副本
            </button>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                onClick={() => handleToggleShotFavorite(selectedWorkspaceItem.id)}
              >
                {getShotCreative(selectedWorkspaceItem).favorite ? '取消收藏' : '收藏'}
              </button>
              {canDeleteItem ? (
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 px-2 text-[10px] leading-none text-red-500 hover:bg-red-500/10"
                  onClick={() => void handleDelete(selectedWorkspaceItem.id)}
                >
                  删除
                </button>
              ) : null}
            </>
          )
        }
      />
      {isBuiltinShotId(selectedWorkspaceItem.id) ? (
        <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
          内置镜头只读。请先「导入副本」后再编辑或删除。
        </div>
      ) : null}
      <AssetEditQuickJump
        items={filtered.map((i) => ({ id: i.id, label: i.label }))}
        currentId={selectedWorkspaceItem.id}
        onJump={(id) => setEditId(id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ShotDetailFields
          item={selectedWorkspaceItem}
          onChange={
            isBuiltinShotId(selectedWorkspaceItem.id)
              ? () => toastError('内置镜头不可修改，请先导入副本')
              : saveWorkspaceItem
          }
          onRefreshPrompts={
            isBuiltinShotId(selectedWorkspaceItem.id)
              ? () => toastError('内置镜头不可修改，请先导入副本')
              : () => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))
          }
          onUploadGif={
            isBuiltinShotId(selectedWorkspaceItem.id)
              ? async () => { toastError('内置镜头不可修改，请先导入副本'); }
              : (f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'gifUrl')
          }
          onUploadExample={
            isBuiltinShotId(selectedWorkspaceItem.id)
              ? async () => { toastError('内置镜头不可修改，请先导入副本'); }
              : (f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'exampleImageUrl')
          }
        />
      </div>
    </div>
  );
}
