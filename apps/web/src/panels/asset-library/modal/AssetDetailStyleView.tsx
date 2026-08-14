import { formatAssetMention, isBuiltinStylePreset } from '@nx9/shared';
import { api } from '../../../api/client';
import { toastSuccess } from '../../../stores/toast';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { AssetDetailStickyBar } from '../AssetDetailStickyBar';
import { AssetEditQuickJump } from '../AssetEditQuickJump';
import { StyleDetailFields } from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetDetailStyleView() {
  const {
    selectedStyle,
    navStack,
    popNavStack,
    handleCloneBuiltin,
    handleToggleStyleFavorite,
    canDeleteItem,
    handleDelete,
    filtered,
    setEditId,
    scope,
    handleSaveStyle,
  } = useAssetLibraryModal();
  const publicUpsertStyle = usePublicAssetLibrary((s) => s.upsertStyle);

  if (!selectedStyle) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetDetailStickyBar
        title={`${isBuiltinStylePreset(selectedStyle) ? '内置 · ' : ''}${selectedStyle.name}`}
        onBackToList={() => setEditId(null)}
        navPrevLabel={navStack.length > 0 ? navStack[navStack.length - 1]?.label : null}
        onBackToPrev={navStack.length > 0 ? popNavStack : undefined}
        onCopyMention={() => {
          void navigator.clipboard.writeText(
            formatAssetMention('style', selectedStyle.name),
          );
          toastSuccess('已复制 @提及');
        }}
        more={
          isBuiltinStylePreset(selectedStyle) ? (
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
              onClick={() => handleCloneBuiltin(selectedStyle.id)}
            >
              导入副本
            </button>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                onClick={() => handleToggleStyleFavorite(selectedStyle.id)}
              >
                {selectedStyle.favorite ? '取消收藏' : '收藏'}
              </button>
              {canDeleteItem ? (
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 px-2 text-[10px] leading-none text-red-500 hover:bg-red-500/10"
                  onClick={() => void handleDelete(selectedStyle.id)}
                >
                  删除
                </button>
              ) : null}
            </>
          )
        }
      />
      {isBuiltinStylePreset(selectedStyle) ? (
        <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
          内置风格只读。请先「导入副本」后再编辑或删除。
        </div>
      ) : null}
      <AssetEditQuickJump
        items={filtered.map((i) => ({ id: i.id, label: i.label }))}
        currentId={selectedStyle.id}
        onJump={(id) => setEditId(id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <StyleDetailFields
          style={selectedStyle}
          readOnly={scope !== 'public' || isBuiltinStylePreset(selectedStyle)}
          onChange={handleSaveStyle}
          onUploadReference={
            scope === 'public' && !isBuiltinStylePreset(selectedStyle)
              ? (file) => {
                  void (async () => {
                    const res = await api.uploadAsset(file);
                    publicUpsertStyle({
                      ...selectedStyle,
                      referenceImageUrl: res.url,
                    });
                  })();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
