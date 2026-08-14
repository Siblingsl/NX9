import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type {
  AssetScope,
  BacklotWorkspaceItem,
  CharacterProfile,
  EntitySheetCropKind,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  CHARACTER_SHEET_CANVAS_HEIGHT,
  CHARACTER_SHEET_CANVAS_WIDTH,
  CHARACTER_SHEET_CATEGORY_LAYOUTS,
  MAX_ENV_REFERENCE_IMAGES,
  buildCharacterSheetGenerationPrompt,
  buildCostumeSheetGenerationPrompt,
  buildPropSheetGenerationPrompt,
  buildSceneSheetGenerationPrompt,
  getCharacterCreative,
  getCostumeCreative,
  getPropCreative,
  getSceneCreative,
  applyCroppedPanelsToCharacter,
  newBacklotWorkspaceItem,
  refreshCharacterPrompts,
  refreshVoicePrompts,
  refreshWorkspacePrompts,
  workspaceItemToCustomTemplate,
} from '@nx9/shared';
import { api } from '../../../api/client';
import { cropCharacterSheetPanels } from '../../../engine/character-sheet-crop';
import { cropEntitySheetPanel } from '../../../engine/entity-sheet-crop';
import { getGenPack } from '../../../engine/gen-skill-runtime';
import { runPictureGenJob } from '../../../engine/picture-gen-runner';
import { useActivityLog } from '../../../stores/activity-log';
import { useAssetLibraryGenSettings } from '../../../stores/asset-library-gen-settings';
import { usePublicAssetLibrary } from '../../../stores/public-asset-library';
import { toastSuccess } from '../../../stores/toast';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { resolveAssetLibraryImageRequest } from '../AssetLibraryGenSettings';

export type AssetLibraryGenerationDeps = {
  scope: AssetScope;
  canEditPrivate: boolean;
  selectedWorkspaceItem: BacklotWorkspaceItem | undefined;
  saveCharacter: (c: CharacterProfile) => void | Promise<void>;
  saveSound: (s: SoundAssetProfile) => void;
  saveWorkspaceItem: (item: BacklotWorkspaceItem) => void;
  setCostumeGenBusy: Dispatch<SetStateAction<boolean>>;
  setCostumeGenProgress: Dispatch<SetStateAction<string | null>>;
  setSceneGenBusy: Dispatch<SetStateAction<boolean>>;
  setPropGenBusy: Dispatch<SetStateAction<boolean>>;
  setEntityGenError: Dispatch<SetStateAction<string | null>>;
  setEntityCropBusy: Dispatch<SetStateAction<boolean>>;
  setCharSheetGenBusy: Dispatch<SetStateAction<boolean>>;
  setCharSheetGenProgress: Dispatch<SetStateAction<string | null>>;
};

export function useAssetLibraryGeneration(deps: AssetLibraryGenerationDeps) {
  const {
    scope,
    canEditPrivate,
    selectedWorkspaceItem,
    saveCharacter,
    saveSound,
    saveWorkspaceItem,
    setCostumeGenBusy,
    setCostumeGenProgress,
    setSceneGenBusy,
    setPropGenBusy,
    setEntityGenError,
    setEntityCropBusy,
    setCharSheetGenBusy,
    setCharSheetGenProgress,
  } = deps;

  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const sounds = useWorkspaceDocument((s) => s.soundLibrary.sounds);
  const workspaceItems = useWorkspaceDocument((s) => s.backlotWorkspace.items);
  const publicCharacters = usePublicAssetLibrary((s) => s.payload.characters);
  const publicSounds = usePublicAssetLibrary((s) => s.payload.sounds);
  const publicUpsertTemplate = usePublicAssetLibrary((s) => s.upsertTemplate);

  const characterSheetGen = useAssetLibraryGenSettings((s) => s.characterSheet);
  const costumeSheetGen = useAssetLibraryGenSettings((s) => s.costumeSheet);
  const sceneSheetGen = useAssetLibraryGenSettings((s) => s.scene);

  const handleUploadCharacterView = useCallback(
    async (file: File, char: CharacterProfile, view: string) => {
      const res = await api.uploadAsset(file);
      const fieldMap: Record<string, string> = {
        full: 'fullSheetUrl',
        front: 'frontViewUrl',
        threeQuarter: 'threeQuarterViewUrl',
        side: 'sideViewUrl',
        back: 'backViewUrl',
        silhouetteFront: 'silhouetteFrontUrl',
        silhouetteSide: 'silhouetteSideUrl',
      };

      // variant uploads: expr:id / micro:id / angle:id / pose:id / costumeDetail:id / hand:id
      if (view.includes(':')) {
        const [group, id] = view.split(':');
        const creative = { ...(char.creative ?? {}) } as Record<string, unknown>;
        const groupKey =
          group === 'expr' ? 'expressions'
            : group === 'micro' ? 'microExpressions'
              : group === 'angle' ? 'angles'
                : group === 'pose' ? 'poses'
                  : group === 'costumeDetail' ? 'costumeDetails'
                    : group === 'hand' ? 'handRefs'
                      : null;
        if (!groupKey) return;
        const list = Array.isArray(creative[groupKey]) ? [...(creative[groupKey] as any[])] : [];
        const idx = list.findIndex((item) => item.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], imageUrl: res.url };
        else list.push({ id, label: id, imageUrl: res.url });
        creative[groupKey] = list;
        saveCharacter({ ...char, creative: creative as CharacterProfile['creative'] });
        return;
      }

      const key = fieldMap[view] ?? 'frontViewUrl';
      saveCharacter({
        ...char,
        creative: {
          ...char.creative,
          [key]: res.url,
        },
        referenceImageUrl: view === 'front' || view === 'full' ? res.url : char.referenceImageUrl,
      });
    },
    [saveCharacter],
  );

  /** 素材库出图：直接走设置连接中的模型 + 本地面板参数，不依赖画布 picture-gen 实体节点 */
  const resolveAssetGenRequest = useCallback((kind: 'character-sheet' | 'costume-sheet' | 'scene-sheet' | 'prop-sheet') => {
    if (kind === 'character-sheet') {
      // 设定板裁切依赖固定母板；不能让用户的通用尺寸设置改变坐标系。
      return resolveAssetLibraryImageRequest(
        { ...characterSheetGen, aspectRatio: 'custom', quality: 'high', resolutionTier: '4k' },
        { width: CHARACTER_SHEET_CANVAS_WIDTH, height: CHARACTER_SHEET_CANVAS_HEIGHT },
      );
    }
    if (kind === 'scene-sheet') {
      return resolveAssetLibraryImageRequest(sceneSheetGen);
    }
    if (kind === 'prop-sheet') {
      return resolveAssetLibraryImageRequest(costumeSheetGen);
    }
    return resolveAssetLibraryImageRequest(costumeSheetGen);
  }, [characterSheetGen, costumeSheetGen, sceneSheetGen]);

  const uploadCroppedEntityCover = useCallback(
    async (sheetUrl: string, kind: EntitySheetCropKind, fileStem: string): Promise<string> => {
      const blob = await cropEntitySheetPanel(sheetUrl, kind);
      const file = new File([blob], `${fileStem}.jpg`, { type: 'image/jpeg' });
      const uploaded = await api.uploadAsset(file);
      return uploaded.url;
    },
    [],
  );

  const cropWorkspaceEntityCover = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('裁切封面：请在可编辑私有库中操作');
        return;
      }
      const sheetUrl =
        item.kind === 'costume'
          ? getCostumeCreative(item).sheetUrl
          : item.kind === 'scene'
            ? getSceneCreative(item).sheetUrl
            : item.kind === 'prop'
              ? getPropCreative(item).sheetUrl
              : null;
      if (!sheetUrl?.trim()) {
        appendLog('裁切封面：请先有设定板图片');
        return;
      }
      const cropKind: EntitySheetCropKind =
        item.kind === 'scene' ? 'scene-hero' : item.kind === 'prop' ? 'prop-front' : 'costume-front';
      setEntityCropBusy(true);
      try {
        const coverUrl = await uploadCroppedEntityCover(sheetUrl, cropKind, `cover-${item.kind}-${item.id}`);
        if (item.kind === 'costume') {
          const ext = getCostumeCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, frontFlatUrl: coverUrl } });
        } else if (item.kind === 'scene') {
          const ext = getSceneCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, coverUrl } });
        } else if (item.kind === 'prop') {
          const ext = getPropCreative(item);
          saveWorkspaceItem({ ...item, creative: { ...ext, coverUrl } });
        }
        toastSuccess('封面已从设定板裁切');
        appendLog(`封面裁切完成 · ${item.label}`);
      } catch (e) {
        appendLog(`封面裁切失败 · ${item.label}: ${String(e)}`);
      } finally {
        setEntityCropBusy(false);
      }
    },
    [appendLog, canEditPrivate, saveWorkspaceItem, scope, uploadCroppedEntityCover, setEntityCropBusy],
  );

  const generateCostumeSheets = useCallback(
    async (items: BacklotWorkspaceItem[]) => {
      if (scope !== 'private') {
        appendLog('服装设定板：请先导入到私有项目库再生成');
        return;
      }
      if (!canEditPrivate) {
        appendLog('服装设定板：当前项目不可编辑');
        return;
      }
      const targets = items.filter((i) => i.kind === 'costume');
      if (targets.length === 0) {
        appendLog('服装设定板：没有可生成的服装条目');
        return;
      }
      setCostumeGenBusy(true);
      setCostumeGenProgress(`0/${targets.length}`);
      appendLog(`开始生成服装设定板 · ${targets.length} 件`);

      const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('costume-sheet');
      appendLog(`服装设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setCostumeGenProgress(`${i + 1}/${targets.length}`);
        try {
          const refreshed = refreshWorkspacePrompts(item);
          const prompt = buildCostumeSheetGenerationPrompt(refreshed);
          const urls = await runPictureGenJob({
            prompt,
            modelId,
            size,
            n: 1,
            resolutionTier,
          });
          const imageUrl = urls[0];
          if (!imageUrl) throw new Error('未返回图片');
          const ext = getCostumeCreative(refreshed);
          let frontFlatUrl = ext.frontFlatUrl || imageUrl;
          try {
            frontFlatUrl = await uploadCroppedEntityCover(
              imageUrl,
              'costume-front',
              `costume-front-${item.id}`,
            );
          } catch (cropErr) {
            appendLog(`服装封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
          }
          saveWorkspaceItem({
            ...refreshed,
            creative: {
              ...ext,
              sheetUrl: imageUrl,
              frontFlatUrl,
            },
          });
          ok += 1;
          appendLog(`服装设定板完成 · ${item.label}`);
        } catch (e) {
          fail += 1;
          appendLog(`服装设定板失败 · ${item.label}: ${String(e)}`);
        }
      }

      setCostumeGenBusy(false);
      setCostumeGenProgress(null);
      appendLog(`服装设定板批量结束 · 成功 ${ok} · 失败 ${fail}`);
      if (ok > 0) toastSuccess(`服装设定板完成 ${ok}/${targets.length}`);
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover, setCostumeGenBusy, setCostumeGenProgress],
  );

  const generateSceneSheet = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('场景设定板：请在可编辑私有库中生成');
        return;
      }
      if (item.kind !== 'scene') return;
      setSceneGenBusy(true);
      setEntityGenError(null);
      appendLog(`开始生成场景空间设定板 · ${item.label}`);
      try {
        const refreshed = refreshWorkspacePrompts(item);
        const prompt = buildSceneSheetGenerationPrompt(refreshed);
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('scene-sheet');
        appendLog(`场景设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const urls = await runPictureGenJob({ prompt, modelId, size, n: 1, resolutionTier });
        const imageUrl = urls[0];
        if (!imageUrl) throw new Error('未返回图片');
        const ext = getSceneCreative(refreshed);
        let coverUrl = ext.coverUrl || undefined;
        try {
          coverUrl = await uploadCroppedEntityCover(imageUrl, 'scene-hero', `scene-cover-${item.id}`);
        } catch (cropErr) {
          appendLog(`场景封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
        }
        saveWorkspaceItem({
          ...refreshed,
          creative: { ...ext, sheetUrl: imageUrl, coverUrl: coverUrl ?? ext.coverUrl },
        });
        toastSuccess(`场景设定板已生成：${item.label}`);
        appendLog(`场景设定板完成 · ${item.label}`);
      } catch (e) {
        const msg = String(e);
        setEntityGenError(msg);
        appendLog(`场景设定板失败 · ${item.label}: ${msg}`);
      } finally {
        setSceneGenBusy(false);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover, setSceneGenBusy, setEntityGenError],
  );

  const generatePropSheet = useCallback(
    async (item: BacklotWorkspaceItem) => {
      if (scope !== 'private' || !canEditPrivate) {
        appendLog('道具设定板：请在可编辑私有库中生成');
        return;
      }
      if (item.kind !== 'prop') return;
      setPropGenBusy(true);
      setEntityGenError(null);
      appendLog(`开始生成道具三视图板 · ${item.label}`);
      try {
        const refreshed = refreshWorkspacePrompts(item);
        const prompt = buildPropSheetGenerationPrompt(refreshed);
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('prop-sheet');
        appendLog(`道具设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const urls = await runPictureGenJob({ prompt, modelId, size, n: 1, resolutionTier });
        const imageUrl = urls[0];
        if (!imageUrl) throw new Error('未返回图片');
        const ext = getPropCreative(refreshed);
        let coverUrl = ext.coverUrl || undefined;
        try {
          coverUrl = await uploadCroppedEntityCover(imageUrl, 'prop-front', `prop-cover-${item.id}`);
        } catch (cropErr) {
          appendLog(`道具封面裁切跳过 · ${item.label}: ${String(cropErr)}`);
        }
        saveWorkspaceItem({
          ...refreshed,
          creative: { ...ext, sheetUrl: imageUrl, coverUrl: coverUrl ?? ext.coverUrl },
        });
        toastSuccess(`道具三视图板已生成：${item.label}`);
        appendLog(`道具设定板完成 · ${item.label}`);
      } catch (e) {
        const msg = String(e);
        setEntityGenError(msg);
        appendLog(`道具设定板失败 · ${item.label}: ${msg}`);
      } finally {
        setPropGenBusy(false);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveWorkspaceItem, scope, uploadCroppedEntityCover, setPropGenBusy, setEntityGenError],
  );

  const suggestCreatePropsFromScene = useCallback(
    (sceneItem: BacklotWorkspaceItem, names: string[]) => {
      if (scope !== 'private' || !canEditPrivate) return;
      const createdIds: string[] = [];
      for (const name of names) {
        const label = name.trim();
        if (!label) continue;
        const exists = workspaceItems.find(
          (w) => w.kind === 'prop' && w.label.trim().toLowerCase() === label.toLowerCase(),
        );
        if (exists) {
          createdIds.push(exists.id);
          continue;
        }
        const item = refreshWorkspacePrompts({
          ...newBacklotWorkspaceItem('prop'),
          label,
          promptZh: label,
          creative: {
            description: `从场景「${sceneItem.label}」文本道具建档`,
            linkedSceneIds: [sceneItem.id],
            linkedScenes: [sceneItem.label],
          },
        });
        saveWorkspaceItem(item);
        createdIds.push(item.id);
      }
      const ext = getSceneCreative(sceneItem);
      const nextPropIds = [...new Set([...(ext.propIds ?? []), ...createdIds])];
      const remainingText = (ext.props ?? []).filter(
        (p) => !names.some((n) => n.trim().toLowerCase() === p.trim().toLowerCase()),
      );
      saveWorkspaceItem({
        ...sceneItem,
        creative: {
          ...ext,
          propIds: nextPropIds,
          props: remainingText,
        },
      });
      toastSuccess(`已建档并挂接 ${createdIds.length} 个道具`);
      appendLog(`场景「${sceneItem.label}」：文本道具建档 ${createdIds.length} 个`);
    },
    [appendLog, canEditPrivate, saveWorkspaceItem, scope, workspaceItems],
  );

  const togglePropLinkedScene = useCallback(
    (propItem: BacklotWorkspaceItem, sceneId: string, linked: boolean) => {
      const propExt = getPropCreative(propItem);
      const nextLinked = linked
        ? [...new Set([...(propExt.linkedSceneIds ?? []), sceneId])]
        : (propExt.linkedSceneIds ?? []).filter((id) => id !== sceneId);
      saveWorkspaceItem({
        ...propItem,
        creative: { ...propExt, linkedSceneIds: nextLinked },
      });
      const scene = workspaceItems.find((w) => w.id === sceneId && w.kind === 'scene');
      if (!scene) return;
      const sceneExt = getSceneCreative(scene);
      const nextPropIds = linked
        ? [...new Set([...(sceneExt.propIds ?? []), propItem.id])]
        : (sceneExt.propIds ?? []).filter((id) => id !== propItem.id);
      saveWorkspaceItem({
        ...scene,
        creative: { ...sceneExt, propIds: nextPropIds },
      });
    },
    [saveWorkspaceItem, workspaceItems],
  );

  const generateCharacterMasterSheet = useCallback(
    async (char: CharacterProfile) => {
      if (scope === 'private' && !canEditPrivate) {
        appendLog('角色设定板：当前项目不可编辑');
        return;
      }

      setCharSheetGenBusy(true);
      setCharSheetGenProgress('生成完整设定板…');
      appendLog(`开始生成角色完整设定板 · ${char.name || char.id}`);

      try {
        const refreshed = refreshCharacterPrompts(char);
        const masterPack = await getGenPack('gen-character-sheet-master');
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('character-sheet');
        appendLog(`完整设定板参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size}`);
        const seedUrl =
          refreshed.referenceImageUrl
          || refreshed.creative?.frontViewUrl
          || undefined;
        const prompt = buildCharacterSheetGenerationPrompt(refreshed, masterPack);
        const urls = await runPictureGenJob({
          prompt,
          modelId,
          size,
          n: 1,
          resolutionTier,
          referenceImageUrl: seedUrl || undefined,
        });
        const sheetUrl = urls[0];
        if (!sheetUrl) throw new Error('完整设定板未返回图片');

        const ext = getCharacterCreative(refreshed);
        saveCharacter({
          ...refreshed,
          creative: {
            ...ext,
            fullSheetUrl: sheetUrl,
          },
        });
        appendLog(`角色完整设定板完成 · ${char.name || char.id}`);
        toastSuccess('角色完整设定板已生成，确认后再生成五类原图');
      } catch (e) {
        appendLog(`角色完整设定板失败: ${String(e)}`);
      } finally {
        setCharSheetGenBusy(false);
        setCharSheetGenProgress(null);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveCharacter, scope, setCharSheetGenBusy, setCharSheetGenProgress],
  );

  const generateCharacterCategorySheets = useCallback(
    async (char: CharacterProfile) => {
      if (scope === 'private' && !canEditPrivate) {
        appendLog('五类原图：当前项目不可编辑');
        return;
      }

      const masterUrl = char.creative?.fullSheetUrl?.trim();
      if (!masterUrl) {
        appendLog('五类原图：请先生成并确认角色完整设定板');
        toastSuccess('请先生成角色完整设定板');
        return;
      }

      setCharSheetGenBusy(true);
      setCharSheetGenProgress('生成分类图 0/5');
      appendLog(`开始生成五类原图 · ${char.name || char.id}`);

      try {
        const refreshed = refreshCharacterPrompts(char);
        const masterPack = await getGenPack('gen-character-sheet-master');
        const { modelId, quality, aspectRatio, size, resolutionTier } = resolveAssetGenRequest('character-sheet');
        appendLog(`五类原图参数 · 模型 ${modelId} · 清晰度 ${resolutionTier} · 质量 ${quality} · 比例 ${aspectRatio} · ${size} · 参考完整设定板`);

        const panelUrls: Record<string, string> = {};
        const categorySheetUrls: Record<string, string> = {};
        for (let categoryIndex = 0; categoryIndex < CHARACTER_SHEET_CATEGORY_LAYOUTS.length; categoryIndex++) {
          const category = CHARACTER_SHEET_CATEGORY_LAYOUTS[categoryIndex];
          setCharSheetGenProgress(`生成分类图 ${categoryIndex + 1}/5：${category.label}`);
          const prompt = buildCharacterSheetGenerationPrompt(refreshed, masterPack, category.id);
          const urls = await runPictureGenJob({
            prompt,
            modelId,
            size,
            n: 1,
            resolutionTier,
            referenceImageUrl: masterUrl,
          });
          const sheetUrl = urls[0];
          if (!sheetUrl) throw new Error(`${category.label}未返回图片`);
          categorySheetUrls[category.id] = sheetUrl;

          const blobs = await cropCharacterSheetPanels(sheetUrl, category);
          const entries = Object.entries(blobs);
          for (let i = 0; i < entries.length; i++) {
            const [panelId, blob] = entries[i];
            setCharSheetGenProgress(`裁切上传 ${categoryIndex + 1}/5 · ${i + 1}/${entries.length}`);
            const file = new File([blob], `char-sheet-${char.id}-${category.id}-${panelId}.jpg`, { type: 'image/jpeg' });
            const uploaded = await api.uploadAsset(file);
            panelUrls[panelId] = uploaded.url;
          }
        }

        const next = applyCroppedPanelsToCharacter(refreshed, {
          panelUrls,
          categorySheetUrls,
          overwrite: true,
        });
        saveCharacter(next);
        appendLog(`五类原图完成并回填 ${Object.keys(panelUrls).length} 格 · ${char.name || char.id}`);
        toastSuccess(`五类原图已回填 ${Object.keys(panelUrls).length} 个面板`);
      } catch (e) {
        appendLog(`五类原图失败: ${String(e)}`);
      } finally {
        setCharSheetGenBusy(false);
        setCharSheetGenProgress(null);
      }
    },
    [appendLog, canEditPrivate, resolveAssetGenRequest, saveCharacter, scope, setCharSheetGenBusy, setCharSheetGenProgress],
  );

  const handleUploadWorkspaceMedia = useCallback(
    async (file: File, item: BacklotWorkspaceItem, field: string) => {
      const res = await api.uploadAsset(file);
      const creative = { ...(item.creative as Record<string, unknown>) };
      if (field === 'referenceUrls') {
        const prev = Array.isArray(creative.referenceUrls)
          ? (creative.referenceUrls.filter(Boolean) as string[])
          : [];
        if (prev.includes(res.url)) {
          appendLog('参考图已存在，跳过重复上传');
          return;
        }
        if (prev.length >= MAX_ENV_REFERENCE_IMAGES) {
          appendLog(`参考图已达上限 ${MAX_ENV_REFERENCE_IMAGES} 张`);
          return;
        }
        creative.referenceUrls = [...prev, res.url];
      } else {
        creative[field] = res.url;
      }
      saveWorkspaceItem({ ...item, creative: creative as BacklotWorkspaceItem['creative'] });
    },
    [appendLog, saveWorkspaceItem],
  );

  const handleRemoveSceneRef = useCallback(
    (item: BacklotWorkspaceItem, index: number) => {
      const creative = getSceneCreative(item);
      const refs = [...(creative.referenceUrls ?? [])];
      if (index < 0 || index >= refs.length) return;
      refs.splice(index, 1);
      saveWorkspaceItem({
        ...item,
        creative: { ...creative, referenceUrls: refs } as BacklotWorkspaceItem['creative'],
      });
    },
    [saveWorkspaceItem],
  );

  const handleUploadAudio = useCallback(
    async (file: File, target: { kind: 'character' | 'sound'; id: string }) => {
      const res = await api.uploadAsset(file);
      if (target.kind === 'character') {
        const c = (scope === 'private' ? characters : publicCharacters).find((x) => x.id === target.id);
        if (!c) return;
        saveCharacter({ ...c, referenceAudioUrl: res.url });
      } else {
        const s = (scope === 'private' ? sounds : publicSounds).find((x) => x.id === target.id);
        if (!s) return;
        saveSound({ ...s, audioUrl: res.url });
      }
    },
    [scope, characters, publicCharacters, sounds, publicSounds, saveCharacter, saveSound],
  );

  const promoteToPublic = useCallback(() => {
    if (!selectedWorkspaceItem || scope !== 'private') return;
    const tpl = workspaceItemToCustomTemplate(selectedWorkspaceItem, '公共库');
    publicUpsertTemplate(tpl);
    toastSuccess('已复制到公共素材库');
  }, [selectedWorkspaceItem, scope, publicUpsertTemplate]);

  return {
    handleUploadCharacterView,
    resolveAssetGenRequest,
    uploadCroppedEntityCover,
    cropWorkspaceEntityCover,
    generateCostumeSheets,
    generateSceneSheet,
    generatePropSheet,
    suggestCreatePropsFromScene,
    togglePropLinkedScene,
    generateCharacterMasterSheet,
    generateCharacterCategorySheets,
    handleUploadWorkspaceMedia,
    handleRemoveSceneRef,
    handleUploadAudio,
    promoteToPublic,
  };
}
