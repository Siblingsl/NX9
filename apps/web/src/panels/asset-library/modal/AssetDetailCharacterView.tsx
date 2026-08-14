import { formatAssetMention, newSoundAsset, refreshCharacterPrompts, refreshVoicePrompts } from '@nx9/shared';
import { toastSuccess } from '../../../stores/toast';
import { AssetDetailStickyBar } from '../AssetDetailStickyBar';
import { AssetEditQuickJump } from '../AssetEditQuickJump';
import AssetLibraryGenSettings from '../AssetLibraryGenSettings';
import { CharacterDetailFields } from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetDetailCharacterView() {
  const {
    selectedChar,
    navStack,
    popNavStack,
    canWrite,
    saveCharacter,
    handleToggleCharacterLock,
    canCreateAsset,
    charSheetGenBusy,
    charSheetGenProgress,
    generateCharacterMasterSheet,
    generateCharacterCategorySheets,
    characterSheetGen,
    setCharacterSheetGen,
    scope,
    handlePublishToPublic,
    canDeleteItem,
    handleDelete,
    filtered,
    setEditId,
    handleUploadAudio,
    handleUploadCharacterView,
    costumeBindOptions,
    saveSound,
    jumpToAsset,
  } = useAssetLibraryModal();

  if (!selectedChar) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetDetailStickyBar
        title={selectedChar.name}
        onBackToList={() => setEditId(null)}
        navPrevLabel={navStack.length > 0 ? navStack[navStack.length - 1]?.label : null}
        onBackToPrev={navStack.length > 0 ? popNavStack : undefined}
        revisionLabel={`资产 v${selectedChar.revision ?? 1}`}
        onBumpRevision={canWrite ? () => {
          const rev = (selectedChar.revision ?? 1) + 1;
          const prompt = selectedChar.consistencyPrompt?.trim() || '';
          void saveCharacter({
            ...selectedChar,
            revision: rev,
            creative: {
              ...selectedChar.creative,
              consistency: {
                ...selectedChar.creative?.consistency,
                locked: true,
                lockedPromptSnapshot: prompt || selectedChar.creative?.consistency?.lockedPromptSnapshot,
                lockedAt: new Date().toISOString(),
              },
            },
          });
          toastSuccess(`已新建角色版本 v${rev}（已锁定 Prompt；旧镜 pin 仍钉旧版）`);
        } : undefined}
        onCopyMention={() => {
          void navigator.clipboard.writeText(formatAssetMention('character', selectedChar.name));
          toastSuccess('已复制 @提及');
        }}
        lockLabel={selectedChar.creative?.consistency?.locked ? '解锁' : '锁定'}
        onToggleLock={() => handleToggleCharacterLock(selectedChar.id)}
        primaryGen={
          canWrite
            ? [
                {
                  label: '完整设定板',
                  disabled: !canCreateAsset || charSheetGenBusy,
                  title: '主生成 · 角色完整设定板',
                  onClick: () => {
                    if (canCreateAsset) void generateCharacterMasterSheet(selectedChar);
                  },
                },
                {
                  label: '五类原图',
                  disabled: !canCreateAsset || charSheetGenBusy || !selectedChar.creative?.fullSheetUrl?.trim(),
                  title: selectedChar.creative?.fullSheetUrl?.trim()
                    ? '基于完整设定板生成五类原图'
                    : '请先生成完整设定板',
                  onClick: () => {
                    if (canCreateAsset) void generateCharacterCategorySheets(selectedChar);
                  },
                },
              ]
            : undefined
        }
        genSettingsSlot={
          canWrite ? (
            <AssetLibraryGenSettings
              preset="character-sheet"
              value={characterSheetGen}
              onChange={setCharacterSheetGen}
            />
          ) : undefined
        }
        moreActions={[
          ...(scope === 'private' && canWrite
            ? [{ label: '发布到公共', onClick: () => void handlePublishToPublic(selectedChar.id) }]
            : []),
          ...(canDeleteItem
            ? [{ label: '删除', danger: true as const, onClick: () => void handleDelete(selectedChar.id) }]
            : []),
        ]}
      />

      <AssetEditQuickJump
        items={filtered.map((i) => ({ id: i.id, label: i.label }))}
        currentId={selectedChar.id}
        onJump={(id) => setEditId(id)}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <CharacterDetailFields
          character={selectedChar}
          onChange={(next) => { void saveCharacter(next); }}
          onRefreshPrompts={() => { void saveCharacter(refreshCharacterPrompts(selectedChar)); }}
          onUploadAudio={(f) => void handleUploadAudio(f, { kind: 'character', id: selectedChar.id })}
          onUploadView={(view, f) => void handleUploadCharacterView(f, selectedChar, view)}
          costumeOptions={costumeBindOptions}
          chromeOwnsPrimaryGen
          onGenerateMasterSheet={canWrite ? () => {
            if (canCreateAsset) void generateCharacterMasterSheet(selectedChar);
          } : undefined}
          onGenerateCategorySheets={canWrite ? () => {
            if (canCreateAsset) void generateCharacterCategorySheets(selectedChar);
          } : undefined}
          generatingMasterSheet={charSheetGenBusy}
          masterSheetProgress={charSheetGenProgress}
          onPublishAudioToSound={canWrite ? () => {
            const s = refreshVoicePrompts(
              newSoundAsset(`${selectedChar.name}·参考音`, 'voice'),
            );
            saveSound({
              ...s,
              audioUrl: selectedChar.referenceAudioUrl || '',
              description: `从角色「${selectedChar.name}」参考音发布`,
            });
            void saveCharacter({
              ...selectedChar,
              soundAssetId: s.id,
            });
            toastSuccess(`已发布到声音库：${s.name}`);
            jumpToAsset('sound', s.id, s.name);
          } : undefined}
        />
      </div>
    </div>
  );
}
