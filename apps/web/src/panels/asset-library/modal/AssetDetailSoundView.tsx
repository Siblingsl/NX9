import {
  formatAssetMention,
  isBuiltinSoundAsset,
  isSoundFavorite,
  refreshVoicePrompts,
} from '@nx9/shared';
import { toastError, toastSuccess } from '../../../stores/toast';
import { AssetDetailStickyBar } from '../AssetDetailStickyBar';
import { AssetEditQuickJump } from '../AssetEditQuickJump';
import { VoiceDetailFields } from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetDetailSoundView() {
  const {
    selectedSound,
    navStack,
    popNavStack,
    handleCloneBuiltin,
    handleToggleSoundFavorite,
    scope,
    canWrite,
    handlePublishToPublic,
    canDeleteItem,
    handleDelete,
    filtered,
    setEditId,
    saveSound,
    characters,
    handleUploadAudio,
    saveCharacter,
  } = useAssetLibraryModal();

  if (!selectedSound) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetDetailStickyBar
        title={`${isBuiltinSoundAsset(selectedSound) ? '内置 · ' : ''}${selectedSound.name}`}
        onBackToList={() => setEditId(null)}
        navPrevLabel={navStack.length > 0 ? navStack[navStack.length - 1]?.label : null}
        onBackToPrev={navStack.length > 0 ? popNavStack : undefined}
        onCopyMention={() => {
          void navigator.clipboard.writeText(
            formatAssetMention('sound', selectedSound.name),
          );
          toastSuccess('已复制 @提及');
        }}
        more={
          isBuiltinSoundAsset(selectedSound) ? (
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-brand/35 bg-brand/10 px-2 text-[10px] leading-none text-brand hover:border-brand/50"
              onClick={() => handleCloneBuiltin(selectedSound.id)}
            >
              导入副本
            </button>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                onClick={() => handleToggleSoundFavorite(selectedSound.id)}
              >
                {isSoundFavorite(selectedSound) ? '取消收藏' : '收藏'}
              </button>
              {scope === 'private' && canWrite ? (
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-line px-2 text-[10px] leading-none text-ink/60 hover:border-brand/40"
                  onClick={() => void handlePublishToPublic(selectedSound.id)}
                >
                  发布到公共
                </button>
              ) : null}
              {canDeleteItem ? (
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-red-500/30 px-2 text-[10px] leading-none text-red-500 hover:bg-red-500/10"
                  onClick={() => void handleDelete(selectedSound.id)}
                >
                  删除
                </button>
              ) : null}
            </>
          )
        }
      />
      {isBuiltinSoundAsset(selectedSound) ? (
        <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
          内置声音只读。请先「导入副本」后再编辑或删除。
        </div>
      ) : null}
      <AssetEditQuickJump
        items={filtered.map((i) => ({ id: i.id, label: i.label }))}
        currentId={selectedSound.id}
        onJump={(id) => setEditId(id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <VoiceDetailFields
          sound={selectedSound}
          readOnly={isBuiltinSoundAsset(selectedSound)}
          onChange={saveSound}
          onRefreshPrompts={() => saveSound(refreshVoicePrompts(selectedSound))}
          characterOptions={characters
            .filter((c) => !c.deletedAt)
            .map((c) => ({ id: c.id, name: c.name }))}
          onUploadAudio={
            !isBuiltinSoundAsset(selectedSound)
              ? (f) => void handleUploadAudio(f, { kind: 'sound', id: selectedSound.id })
              : undefined
          }
          onSetAsCharacterReference={
            !isBuiltinSoundAsset(selectedSound)
            && characters.length
            && selectedSound.audioUrl
              ? (characterId) => {
                  const target = characters.find((c) => c.id === characterId);
                  if (!target) {
                    toastError('未找到目标角色');
                    return;
                  }
                  void saveCharacter({
                    ...target,
                    referenceAudioUrl: selectedSound.audioUrl,
                    soundAssetId: selectedSound.id,
                    voiceProfileId: target.voiceProfileId ?? null,
                  });
                  toastSuccess(
                    `已将「${selectedSound.name}」设为角色「${target.name}」参考音（克隆源）`,
                  );
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
