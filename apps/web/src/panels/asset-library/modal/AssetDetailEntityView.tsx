import {
  BUILTIN_BACKLOT_TEMPLATES,
  CAC_COSTUME_VARIANT_PRESETS,
  DEFAULT_PROP_VARIANTS,
  DEFAULT_SCENE_VARIANTS,
  formatAssetMention,
  getCostumeCreative,
  getPropCreative,
  getSceneCreative,
  refreshWorkspacePrompts,
} from '@nx9/shared';
import { api } from '../../../api/client';
import { toastSuccess } from '../../../stores/toast';
import { AssetDetailStickyBar } from '../AssetDetailStickyBar';
import { AssetEditQuickJump } from '../AssetEditQuickJump';
import AssetLibraryGenSettings from '../AssetLibraryGenSettings';
import {
  CostumeDetailFields,
  PropDetailFields,
  SceneDetailFields,
} from '../AssetDetailFields';
import { useAssetLibraryModal } from './AssetLibraryModalContext';

export function AssetDetailEntityView() {
  const {
    selectedWorkspaceItem,
    scope,
    tab,
    navStack,
    popNavStack,
    canEditCurrent,
    canEditPrivate,
    canWrite,
    canDeleteItem,
    publicTemplates,
    saveWorkspaceItem,
    handleToggleEntityLock,
    costumeGenBusy,
    propGenBusy,
    sceneGenBusy,
    generateCostumeSheets,
    generatePropSheet,
    generateSceneSheet,
    sceneSheetGen,
    costumeSheetGen,
    setSceneSheetGen,
    setCostumeSheetGen,
    handlePublishToPublic,
    handleDelete,
    filtered,
    setEditId,
    handleUploadWorkspaceMedia,
    handleRemoveSceneRef,
    propBindOptions,
    jumpToAsset,
    entityGenError,
    cropWorkspaceEntityCover,
    entityCropBusy,
    suggestCreatePropsFromScene,
    propBoundScenes,
    sceneBindOptions,
    togglePropLinkedScene,
    healthAnalysis,
    characters,
    handleCloneBuiltin,
    appendLog,
    workspaceItems,
  } = useAssetLibraryModal();

  if (!selectedWorkspaceItem) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssetDetailStickyBar
        title={selectedWorkspaceItem.label}
        badge={
          scope === 'public'
          && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id
            ? '预览·导入后可编'
            : BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === selectedWorkspaceItem.id && t.kind === tab)
              ? '内置只读'
              : null
        }
        onBackToList={() => setEditId(null)}
        navPrevLabel={navStack.length > 0 ? navStack[navStack.length - 1]?.label : null}
        onBackToPrev={navStack.length > 0 ? popNavStack : undefined}
        revisionLabel={`资产 v${selectedWorkspaceItem.revision ?? 1}`}
        onBumpRevision={
          canEditCurrent
            ? () => {
                const ext =
                  tab === 'costume'
                    ? getCostumeCreative(selectedWorkspaceItem)
                    : tab === 'prop'
                      ? getPropCreative(selectedWorkspaceItem)
                      : getSceneCreative(selectedWorkspaceItem);
                const rev = (selectedWorkspaceItem.revision ?? 1) + 1;
                const prompt =
                  selectedWorkspaceItem.promptEn?.trim()
                  || (ext as { lockedPromptSnapshot?: string }).lockedPromptSnapshot
                  || '';
                saveWorkspaceItem({
                  ...selectedWorkspaceItem,
                  revision: rev,
                  creative: {
                    ...ext,
                    locked: true,
                    lockedPromptSnapshot: prompt || (ext as { lockedPromptSnapshot?: string }).lockedPromptSnapshot,
                    lockedAt: new Date().toISOString(),
                  },
                });
                toastSuccess(`已新建版本 v${rev}（已锁定 Prompt）`);
              }
            : undefined
        }
        onCopyMention={() => {
          void navigator.clipboard.writeText(
            formatAssetMention(tab, selectedWorkspaceItem.label),
          );
          toastSuccess('已复制 @提及');
        }}
        lockLabel={
          tab === 'costume'
            ? (getCostumeCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
            : tab === 'prop'
              ? (getPropCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
              : (getSceneCreative(selectedWorkspaceItem).locked ? '解锁' : '锁定')
        }
        onToggleLock={() => handleToggleEntityLock(selectedWorkspaceItem.id)}
        primaryGen={
          canEditCurrent
            ? {
                label:
                  tab === 'costume'
                    ? '服装设定板'
                    : tab === 'prop'
                      ? '道具三视图'
                      : '场景设定板',
                disabled:
                  tab === 'costume'
                    ? costumeGenBusy
                    : tab === 'prop'
                      ? propGenBusy
                      : sceneGenBusy,
                title: '主生成 · 设定板',
                onClick: () => {
                  if (tab === 'costume') void generateCostumeSheets([selectedWorkspaceItem]);
                  else if (tab === 'prop') void generatePropSheet(selectedWorkspaceItem);
                  else void generateSceneSheet(selectedWorkspaceItem);
                },
              }
            : undefined
        }
        genSettingsSlot={
          canEditCurrent ? (
            <AssetLibraryGenSettings
              preset={tab === 'scene' ? 'scene' : 'costume-sheet'}
              value={tab === 'scene' ? sceneSheetGen : costumeSheetGen}
              onChange={tab === 'scene' ? setSceneSheetGen : setCostumeSheetGen}
            />
          ) : undefined
        }
        moreActions={[
          ...(scope === 'private' && canWrite
            ? [{ label: '发布到公共', onClick: () => void handlePublishToPublic(selectedWorkspaceItem.id) }]
            : []),
          ...(canDeleteItem
            && !(
              scope === 'public'
              && !publicTemplates.some((t) => t.id === selectedWorkspaceItem.id && t.kind === tab)
              && BUILTIN_BACKLOT_TEMPLATES.some((t) => t.id === selectedWorkspaceItem.id && t.kind === tab)
            )
            ? [{ label: '删除', danger: true as const, onClick: () => void handleDelete(selectedWorkspaceItem.id) }]
            : []),
        ]}
      />

      <AssetEditQuickJump
        items={filtered.map((i) => ({ id: i.id, label: i.label }))}
        currentId={selectedWorkspaceItem.id}
        onJump={(id) => setEditId(id)}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'scene' ? (
          <SceneDetailFields
            item={selectedWorkspaceItem}
            onChange={saveWorkspaceItem}
            onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
            onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
            onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
            onUploadCover={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'coverUrl')}
            onRemoveRef={(idx) => handleRemoveSceneRef(selectedWorkspaceItem, idx)}
            propOptions={propBindOptions}
            onOpenProp={(propId) => {
              const hit = propBindOptions.find((p) => p.id === propId);
              jumpToAsset('prop', propId, hit?.label ?? propId);
            }}
            chromeOwnsPrimaryGen
            onGenerateSheet={
              canEditCurrent
                ? () => void generateSceneSheet(selectedWorkspaceItem)
                : undefined
            }
            generatingSheet={sceneGenBusy}
            generateSheetError={entityGenError}
            onCropCoverFromSheet={
              canEditCurrent
                ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                : undefined
            }
            croppingCover={entityCropBusy}
            onSuggestCreateProps={
              canEditCurrent
                ? (names) => suggestCreatePropsFromScene(selectedWorkspaceItem, names)
                : undefined
            }
            onUploadVariant={(variantId, file) => {
              void (async () => {
                const res = await api.uploadAsset(file);
                const ext = getSceneCreative(selectedWorkspaceItem);
                const base = ext.variants?.length ? ext.variants : DEFAULT_SCENE_VARIANTS;
                const variants = base.map((v) =>
                  v.id === variantId ? { ...v, imageUrl: res.url } : v,
                );
                saveWorkspaceItem({
                  ...selectedWorkspaceItem,
                  creative: { ...ext, variants },
                });
              })();
            }}
          />
        ) : null}
        {tab === 'costume' ? (
          <div className="flex h-full min-h-0 flex-col">
            {scope === 'public' && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id ? (
              <div className="shrink-0 border-b border-brand/20 bg-brand/5 px-4 py-2 text-[11px] text-ink/70">
                当前为模板预览。请先导入到可编辑库后再改字段与参考图。
                <button
                  type="button"
                  className="ml-2 text-brand hover:underline"
                  onClick={() => handleCloneBuiltin(selectedWorkspaceItem.id)}
                >
                  立即导入
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">
              <CostumeDetailFields
                item={selectedWorkspaceItem}
                onChange={saveWorkspaceItem}
                onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
                onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
                onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
                onUploadFrontFlat={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'frontFlatUrl')}
                onUploadVariant={(variantId, file) => {
                  void (async () => {
                    const res = await api.uploadAsset(file);
                    const ext = getCostumeCreative(selectedWorkspaceItem);
                    const base = ext.variants?.length ? ext.variants : CAC_COSTUME_VARIANT_PRESETS;
                    const variants = base.map((v) =>
                      v.id === variantId ? { ...v, imageUrl: res.url } : v,
                    );
                    saveWorkspaceItem({
                      ...selectedWorkspaceItem,
                      creative: { ...ext, variants },
                    });
                  })();
                }}
                onCropFrontFromSheet={
                  scope === 'private' && canEditPrivate
                    ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                    : undefined
                }
                croppingFront={entityCropBusy}
                generatingSheet={costumeGenBusy}
                boundCharacterNames={
                  healthAnalysis.costumeBoundCharacters.get(selectedWorkspaceItem.id) ?? []
                }
                onOpenCharacter={(name) => {
                  const hit = characters.find(
                    (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
                  );
                  if (hit) jumpToAsset('character', hit.id, hit.name);
                }}
                chromeOwnsPrimaryGen
                onGenerateSheet={
                  scope === 'private' && canEditPrivate
                    ? () => {
                        const isPreviewOnly = Boolean(
                          selectedWorkspaceItem.sourceTemplateId
                          && selectedWorkspaceItem.sourceTemplateId === selectedWorkspaceItem.id
                          && !workspaceItems.some((w) => w.id === selectedWorkspaceItem.id),
                        );
                        if (isPreviewOnly) {
                          handleCloneBuiltin(selectedWorkspaceItem.id);
                          appendLog('已导入服装模板，请在导入后的条目上再次点击生成设定板');
                          return;
                        }
                        void generateCostumeSheets([selectedWorkspaceItem]);
                      }
                    : undefined
                }
              />
            </div>
          </div>
        ) : null}
        {tab === 'prop' ? (
          <PropDetailFields
            item={selectedWorkspaceItem}
            onChange={saveWorkspaceItem}
            onRefreshPrompts={() => saveWorkspaceItem(refreshWorkspacePrompts(selectedWorkspaceItem))}
            onUploadRef={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'referenceUrls')}
            onUploadSheet={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'sheetUrl')}
            onUploadCover={(f) => void handleUploadWorkspaceMedia(f, selectedWorkspaceItem, 'coverUrl')}
            onUploadVariant={(variantId, file) => {
              void (async () => {
                const res = await api.uploadAsset(file);
                const ext = getPropCreative(selectedWorkspaceItem);
                const base = ext.variants?.length ? ext.variants : DEFAULT_PROP_VARIANTS;
                const variants = base.map((v) =>
                  v.id === variantId ? { ...v, imageUrl: res.url } : v,
                );
                saveWorkspaceItem({
                  ...selectedWorkspaceItem,
                  creative: { ...ext, variants },
                });
              })();
            }}
            boundSceneItems={propBoundScenes.get(selectedWorkspaceItem.id) ?? []}
            onOpenScene={(sceneId) => {
              const hit = (propBoundScenes.get(selectedWorkspaceItem.id) ?? []).find((s) => s.id === sceneId);
              jumpToAsset('scene', sceneId, hit?.label ?? sceneId);
            }}
            sceneOptions={sceneBindOptions}
            onToggleLinkedScene={
              canEditCurrent
                ? (sceneId, linked) => togglePropLinkedScene(selectedWorkspaceItem, sceneId, linked)
                : undefined
            }
            onGenerateSheet={
              canEditCurrent
                ? () => void generatePropSheet(selectedWorkspaceItem)
                : undefined
            }
            generatingSheet={propGenBusy}
            onCropCoverFromSheet={
              canEditCurrent
                ? () => void cropWorkspaceEntityCover(selectedWorkspaceItem)
                : undefined
            }
            croppingCover={entityCropBusy}
            chromeOwnsPrimaryGen
          />
        ) : null}
      </div>
    </div>
  );
}
