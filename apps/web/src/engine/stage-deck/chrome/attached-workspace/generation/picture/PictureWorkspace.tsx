import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import {
  IMAGE_ASPECT_OPTIONS,
  buildCharacterContext,
  lookupBlock,
  resolveImageRequestSize,
  resolvePictureModelForRequest,
} from '@nx9/shared';
import { useReactFlow, useNodes, useEdges } from '@xyflow/react';
import { ImagePlus, Palette, X } from 'lucide-react';
import { AssetMentionInput } from '../../../asset-mention/AssetMentionInput';
import { ComposerModelSelect } from '../../composer/ComposerModelSelect';
import {
  ComposerWorkspaceShell,
  COMPOSER_PROMPT_TEXTAREA_CLASS,
} from '../../composer/ComposerWorkspaceShell';
import { useWorkspaceAiLog } from '../../composer/useWorkspaceAiLog';
import { useDeckUi } from '../../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../../stores/activity-log';
import { usePromptHistory } from '../../../../stores/prompt-history';
import { api } from '../../../../../../api/client';
import { useConnectedPictureModels } from '../../../../../../hooks/use-connected-picture-models';
import { useWorkspaceDocument } from '../../../../../../stores/workspace-document';
import { toastError, toastSuccess } from '../../../../../../stores/toast';
import { useUpstreamMedia } from '../use-upstream-media';
import { useUpstreamShots } from '../use-upstream-shots';
import { useAttachedNodeData } from '../use-attached-node-data';
import { useLocalNodePrompt } from '../use-local-node-prompt';
import {
  buildLocalMediaItems,
  insertLocalMediaMentionAtSelection,
  resolveLocalMediaMentionUrls,
} from '../../../asset-mention/local-media-mention';
import { PictureParamChips } from './PictureParamChips';
import { PictureResultGallery } from './PictureResultGallery';
import {
  PictureUpstreamStrip,
  type PictureRefItem,
} from './PictureUpstreamStrip';
import { PictureMultiPromptEditor } from './PictureMultiPromptEditor';
import { PictureProActionMenu } from './PictureProActionMenu';
import {
  buildClearPictureProActionPatch,
  buildPictureProActionPatch,
  composePictureProPrompt,
  filledMultiPrompts,
  isPictureMultiPromptAction,
  lookupPictureProAction,
  normalizeMultiPrompts,
  seedMultiPrompts,
  type PictureProActionDef,
} from './picture-pro-actions';
import {
  MAX_PICTURE_UPLOAD_REFS,
  patchPictureGenMode,
  patchStyleImageUrl,
  readPictureGenMode,
  patchUploadedReferenceUrls,
  resolvePictureReferenceUrls,
  resolveRuntimePictureGenMode,
  resolveUploadedReferenceUrls,
} from './picture-gen-modes';
import {
  readPictureGenerationHistory,
  restorePictureGeneration,
} from '../../../../../picture-gen-history';
import { resolvePictureSendRefs, uniqueLibraryLabel, type PictureInjectedRef } from '../../../../../picture-gen-refs';
import { commitPicturePreviewUrls, mergePicturePreviewUrls, prunePictureCompiledPrompts, readPictureCompiledPrompts, rebuildPictureCompiledPromptsFromHistory, resolvePictureCompiledPrompt, writePictureShotPatch } from '../../../../../picture-gen-commit';
import { resumePendingImageTasks, type PendingImageTask } from '../../../../../picture-gen-runner';
import {
  abortBlockRun,
  beginBlockRunAbort,
  endBlockRunAbort,
} from '../../../../../block-run-abort';

const EMPTY_HISTORY: { id: string; blockId: string; text: string; savedAt: number }[] = [];
const PICTURE_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'costume', 'prop'];

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function PictureWorkspace({ blockId, kind, onCollapse }: PictureWorkspaceProps) {
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  /** PG-04: 当前运行的取消控制器 */
  const runAbortRef = useRef<AbortController | null>(null);
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const { pictures: upstreamPictures } = useUpstreamMedia(blockId);
  const { hasUpstream, shotIds, shots } = useUpstreamShots(blockId);
  const libraryCharacters = useWorkspaceDocument((s) => s.characters.characters);
  const environments = useWorkspaceDocument((s) => s.environments);
  const handleAiAction = useWorkspaceAiLog();
  const [selectedResult, setSelectedResult] = useState(0);
  const [refBusy, setRefBusy] = useState(false);

  const meta = lookupBlock(kind);
  const data = useAttachedNodeData(blockId);

  const history = useMemo(
    () => (promptEntries ?? EMPTY_HISTORY).filter((e) => e.blockId === blockId).slice(0, 20),
    [promptEntries, blockId],
  );

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(blockId, patch),
    [blockId, updateNodeData],
  );

  // PG-29: 对齐视频工作区——有上游链镜表时自动写入 linkedShotId(s)
  useEffect(() => {
    if (!hasUpstream) {
      if (Array.isArray(data.linkedShotIds) && (data.linkedShotIds as string[]).length > 0) {
        updateNodeData(blockId, { linkedShotIds: [] });
      }
      return;
    }
    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    // PG-39: spawn/用户已指定的 linkedShotId 若仍在上游集合内则保留，禁止强改成第一镜
    const explicitId = (data.linkedShotId as string | undefined)?.trim() ?? undefined;
    const nextId =
      explicitId && shotIds.includes(explicitId)
        ? explicitId
        : (shotIds[0] ?? undefined);
    const prevSingle = (data.linkedShotId as string | undefined) ?? undefined;
    const selectedShot = shots.find((s) => s.id === nextId) ?? shots[0];
    if (
      prev.length === shotIds.length &&
      prev.every((id, i) => id === shotIds[i]) &&
      prevSingle === nextId
    ) {
      return;
    }
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: nextId,
      linkedShotLabel:
        shots.length > 1 && selectedShot
          ? `写回第 ${shots.indexOf(selectedShot) + 1} / ${shots.length} 镜（#${(selectedShot.index ?? 0) + 1}）`
          : selectedShot
            ? `写回镜头 #${(selectedShot.index ?? 0) + 1}`
            : undefined,
    });
  }, [
    hasUpstream,
    shotIds,
    shots,
    blockId,
    updateNodeData,
    data.linkedShotIds,
    data.linkedShotId,
  ]);

  const pushHistoryDebounced = useCallback(
    (text: string) => pushHistory(blockId, text),
    [blockId, pushHistory],
  );

  const { draft, onChange, onFocus, onBlur, applyText, flushNow } = useLocalNodePrompt({
    blockId,
    data,
    updateNodeData,
    onHistoryPush: pushHistoryDebounced,
  });

  const model = (data.model as string) ?? 'gemini-2.5-flash-image';
  const {
    options: pictureModelOptions,
    hasConnections: hasPictureConnections,
    preferredModel,
    selectModel: selectPictureModel,
    openConnectionsSettings,
  } = useConnectedPictureModels(model);

  useEffect(() => {
    if (!preferredModel || preferredModel === model) return;
    if (!hasPictureConnections) return;
    handlePatch({ model: preferredModel });
  }, [hasPictureConnections, handlePatch, model, preferredModel]);

  const status = (data.status as string) ?? 'idle';
  const pictureGenMode = readPictureGenMode(data);
  const proActionId = (data.pictureProAction as string) || undefined;
  const proAction = lookupPictureProAction(proActionId);
  const multiPromptMode = isPictureMultiPromptAction(proActionId);
  const multiPrompts = useMemo(
    () => normalizeMultiPrompts(data.multiPrompts),
    [data.multiPrompts],
  );
  const quality = (data.quality as string) ?? 'auto';
  const aspectRatio = (data.aspectRatio as string) ?? '1:1';
  const imageCount = (data.imageCount as number) ?? 1;
  const customW = (data.width as number) ?? 1024;
  const customH = (data.height as number) ?? 1024;
  const snapToStep = (data.snapToStep as boolean) ?? true;

  const previewUrls = useMemo(() => {
    const urls = (data.previewUrls as string[] | undefined) ?? [];
    if (urls.length > 0) return urls;
    const single = data.previewUrl as string | undefined;
    return single ? [single] : [];
  }, [data.previewUrl, data.previewUrls]);

  /** 每张生成图自己的发送稿；缺账时从历史重建 + 最新一张回退 lastCompiledPrompt */
  const compiledPromptsByUrl = useMemo(() => {
    const stored = { ...readPictureCompiledPrompts(data) };
    const fromHistory = rebuildPictureCompiledPromptsFromHistory(data);
    const last =
      typeof data.lastCompiledPrompt === 'string' ? data.lastCompiledPrompt.trim() : '';
    // 旧图若账本/历史只是在复读「最新一轮」，视为污染，宁可不展示也不误导
    if (last) {
      for (const url of previewUrls.slice(1)) {
        const key = url?.trim();
        if (!key) continue;
        if (stored[key] === last) delete stored[key];
        if (fromHistory[key] === last) delete fromHistory[key];
      }
    }
    const out: Record<string, string> = { ...fromHistory, ...stored };
    if (last && previewUrls[0] && !out[previewUrls[0]]) {
      out[previewUrls[0]] = last;
    }
    return out;
  }, [data, previewUrls]);

  // 把重建后的 per-url 发送稿写回节点，避免下次再误读「最新一轮」
  useEffect(() => {
    if (previewUrls.length === 0) return;
    const stored = readPictureCompiledPrompts(data);
    let dirty = false;
    const next = { ...stored };
    for (const url of previewUrls) {
      const key = url?.trim();
      if (!key) continue;
      const want = compiledPromptsByUrl[key];
      if (want && stored[key] !== want) {
        next[key] = want;
        dirty = true;
      }
    }
    if (!dirty) return;
    handlePatch({
      previewCompiledPrompts: prunePictureCompiledPrompts(next, previewUrls),
    });
    // 仅在账本缺口时回写；故意不依赖 handlePatch 引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, compiledPromptsByUrl, previewUrls]);

  const modelDef = resolvePictureModelForRequest(model);
  /** PG-05: Seed 仅 fal 系模型真实生效 */
  const seedSupported = modelDef.provider === 'fal';
  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? customW : undefined,
    height: aspectRatio === 'custom' ? customH : undefined,
    snapToStep,
  });

  useEffect(() => {
    setSelectedResult(0);
  }, [previewUrls[0]]);

  useEffect(() => {
    const ta = promptContainerRef.current?.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const handleClearProAction = useCallback(() => {
    const excluded = new Set(
      ((data.excludedRefUrls as string[] | undefined) ?? []).filter(Boolean),
    );
    const effectiveRefCount = [
      ...resolveUploadedReferenceUrls(data),
      ...upstreamPictures,
      (data.styleImageUrl as string | undefined)?.trim(),
    ].filter((u): u is string => typeof u === 'string' && Boolean(u.trim()) && !excluded.has(u)).length;
    handlePatch(buildClearPictureProActionPatch(data, effectiveRefCount));
    appendLog('图像专业工具 · 已退出');
  }, [appendLog, data, handlePatch, upstreamPictures]);

  const handleSelectProAction = useCallback(
    (action: PictureProActionDef) => {
      // 再次点同一专业动作 / 已锁死的放大·全景 → 退出，避免只清标记、模式卡住
      const alreadyActive =
        proActionId === action.id ||
        (action.pictureGenMode === 'upscale-hd' && pictureGenMode === 'upscale-hd') ||
        (action.pictureGenMode === 'panorama-720' && pictureGenMode === 'panorama-720');
      if (alreadyActive) {
        handleClearProAction();
        return;
      }
      const patch = buildPictureProActionPatch(action, data);
      // 图生图类自动切支持参考的模型
      if (
        action.needsReference &&
        !resolvePictureModelForRequest(model).supportsReference &&
        action.pictureGenMode !== 'upscale-hd'
      ) {
        patch.model = 'flux-i2i';
      }
      if (action.pictureGenMode === 'panorama-720' && model === 'flux-i2i') {
        patch.model = 'flux-dev';
      }
      if (isPictureMultiPromptAction(action.id)) {
        const seeded = seedMultiPrompts(data.multiPrompts, draft);
        patch.multiPrompts = seeded;
        patch.imageCount = Math.max(1, filledMultiPrompts(seeded).length || seeded.length);
      }
      // 空 prompt 时用动作 hint 作 placeholder 引导；不强制覆盖已有正文
      handlePatch(patch);
      appendLog(`图像专业工具 · ${action.label}`);
    },
    [
      appendLog,
      data.multiPrompts,
      data,
      draft,
      handleClearProAction,
      handlePatch,
      model,
      pictureGenMode,
      proActionId,
    ],
  );

  const handleMultiPromptsChange = useCallback(
    (next: string[]) => {
      const normalized = normalizeMultiPrompts(next);
      const filled = filledMultiPrompts(normalized);
      handlePatch({
        multiPrompts: normalized,
        imageCount: Math.max(1, filled.length || normalized.length),
      });
    },
    [handlePatch],
  );

  const handleDeleteGenerated = useCallback(
    (index: number) => {
      const removed = previewUrls[index];
      const next = previewUrls.filter((_, i) => i !== index);
      handlePatch({
        previewUrls: next,
        previewUrl: next[0] ?? undefined,
        previewCompiledPrompts: prunePictureCompiledPrompts(
          readPictureCompiledPrompts(data),
          next,
        ),
      });
      setSelectedResult((prev) => {
        if (next.length === 0) return 0;
        if (prev > index) return prev - 1;
        if (prev >= next.length) return next.length - 1;
        return prev;
      });
      if (removed) {
        useWorkspaceDocument.getState().trashGeneratedMedia({
          url: removed,
          mediaKind: 'picture',
          label: `生成图 ${index + 1}`,
          sourceBlockId: blockId,
        });
        // PG-40: 删除的是绑定镜 firstFrame 时同步镜表，避免分镜/预览裂图
        const linkedShotId = (data.linkedShotId as string | undefined)?.trim();
        const linkedShot = linkedShotId ? shots.find((s) => s.id === linkedShotId) : undefined;
        if (linkedShot && linkedShot.firstFrameAssetId === removed) {
          writePictureShotPatch({
            blockId,
            shotId: linkedShot.id,
            patch: next[0]
              ? {
                  firstFrameAssetId: next[0],
                  keyframeStatus: 'review' as const,
                  status: 'review' as const,
                }
              : {
                  firstFrameAssetId: null,
                  keyframeStatus: 'draft' as const,
                  status: 'draft' as const,
                },
            updateNodeData: (id, patch) => updateNodeData(id, patch),
            nodes: nodes.map((n) => ({
              id: n.id,
              type: n.type,
              data: (n.data ?? {}) as Record<string, unknown>,
            })),
            edges,
          });
          appendLog('已同步绑定镜头 firstFrame');
        }
        toastSuccess('已移入资产回收站');
      }
      appendLog(`已移入回收站 · 生成图 ${index + 1}`);
    },
    [appendLog, blockId, data, edges, handlePatch, nodes, previewUrls, shots, updateNodeData],
  );

  /** PG-10/PG-23: 把选中生成图入库为场景 / 道具参考（封面 + 参考图带图入库，label 去重） */
  const handleSaveToLibrary = useCallback(
    (url: string, kindTarget: 'scene' | 'prop') => {
      const selectedPrompt =
        resolvePictureCompiledPrompt(data, url) ||
        ((data.content as string) || draft || '').trim();
      const promptText = selectedPrompt.trim();
      const base =
        promptText.split('\n')[0]?.slice(0, 20).trim() ||
        `生成图 ${new Date().toLocaleDateString()}`;
      const existing = useWorkspaceDocument.getState().backlotWorkspace.items.map((i) => i.label);
      const label = uniqueLibraryLabel(base, existing);
      const kindLabel = kindTarget === 'scene' ? '场景' : '道具';
      useWorkspaceDocument.getState().upsertBacklotWorkspace({
        id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: kindTarget,
        label,
        promptEn: promptText,
        revision: 1,
        creative: { coverUrl: url, referenceUrls: [url] },
      });
      appendLog(`已入库为${kindLabel}「${label}」`);
      toastSuccess(`已入库为${kindLabel}「${label}」，可在素材库中完善设定`);
    },
    [appendLog, data, draft],
  );

  const handleSaveToCharacter = useCallback(
    (url: string, characterId: string) => {
      const doc = useWorkspaceDocument.getState();
      const profile = doc.characters.characters.find((c) => c.id === characterId && !c.deletedAt);
      if (!profile) {
        toastError('角色不存在或已在回收站');
        return;
      }
      const nextRevision = (profile.revision ?? 1) + 1;
      const prevMain = profile.referenceImageUrl?.trim();
      const prevList = Array.isArray(profile.creative?.referenceUrls)
        ? profile.creative!.referenceUrls!.filter((u) => typeof u === 'string' && u.trim())
        : [];
      // PG-36: 旧主定妆进列表，新图置顶，不丢历史
      const referenceUrls = [
        url,
        ...[prevMain, ...prevList].filter((u): u is string => Boolean(u) && u !== url),
      ].slice(0, 12);
      doc.upsertCharacter({
        ...profile,
        referenceImageUrl: url,
        revision: nextRevision,
        creative: {
          ...profile.creative,
          referenceUrls,
          fullSheetUrl: profile.creative?.fullSheetUrl ?? url,
        },
      });
      appendLog(`已写入角色定妆「${profile.name}」· revision ${nextRevision}`);
      toastSuccess(`已写入「${profile.name}」定妆（revision ${nextRevision}）`);
    },
    [appendLog],
  );

  const handleRestoreHistory = useCallback(
    (entryId: string) => {
      const restored = restorePictureGeneration(
        entryId,
        previewUrls,
        ((data.content as string) || draft || ''),
        readPictureGenerationHistory(data),
      );
      if (!restored) return;
      const restoredPrompt = (restored.compiledPrompt ?? restored.userPrompt ?? '').trim();
      const restoredPromptMap = Object.fromEntries(
        restored.urls
          .map((u) => u?.trim())
          .filter((u): u is string => Boolean(u))
          .map((u) => [u, restoredPrompt || resolvePictureCompiledPrompt(data, u) || '']),
      );
      // PG-27: 恢复历史同步镜表 firstFrame + 归档当前
      commitPicturePreviewUrls({
        blockId,
        data,
        urls: restored.urls,
        updateNodeData: (id, patch) => updateNodeData(id, patch),
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          data: (n.data ?? {}) as Record<string, unknown>,
        })),
        edges,
        archiveCurrent: false,
        previewCompiledPrompts: prunePictureCompiledPrompts(restoredPromptMap, restored.urls),
        extraPatch: {
          generationHistory: restored.history,
          status: 'success',
          ...(restoredPrompt ? { lastCompiledPrompt: restoredPrompt } : {}),
        },
      });
      appendLog('已恢复上一轮生成结果');
    },
    [appendLog, blockId, data, draft, edges, nodes, previewUrls, updateNodeData],
  );

  /** PG-45: 单独恢复历史条目的用户原稿，不替换当前生成图 */
  const handleRestorePrompt = useCallback(
    (entryId: string) => {
      const entry = readPictureGenerationHistory(data).find((h) => h.id === entryId);
      if (!entry) return;
      applyText(entry.userPrompt ?? entry.prompt);
      appendLog('已恢复该轮用户提示词');
    },
    [appendLog, applyText, data],
  );

  const handleResumePending = useCallback(async () => {
    const raw = data.pendingImageTasks as PendingImageTask[] | undefined;
    const single = (data.pendingImageTaskId as string | undefined)?.trim();
    const tasks: PendingImageTask[] =
      Array.isArray(raw) && raw.length > 0
        ? raw
        : single
          ? [{ taskId: single }]
          : [];
    if (tasks.length === 0) return;
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;
    handlePatch({ status: 'running' });
    try {
      const result = await resumePendingImageTasks(tasks, controller.signal);
      const nextUrls = mergePicturePreviewUrls(previewUrls, result.urls, 'append');
      // PG-27: 继续查询写回预览 + 镜表 firstFrame + 历史归档
      if (result.urls.length) {
        commitPicturePreviewUrls({
          blockId,
          data,
          urls: nextUrls,
          incomingUrls: result.urls,
          compiledPromptForIncoming:
            typeof data.lastCompiledPrompt === 'string'
              ? data.lastCompiledPrompt
              : undefined,
          updateNodeData: (id, patch) => updateNodeData(id, patch),
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            data: (n.data ?? {}) as Record<string, unknown>,
          })),
          edges,
          archiveCurrent: true,
          extraPatch: {
            status: result.stillPending.length ? 'running' : 'success',
            pendingImageTasks: result.stillPending.length ? result.stillPending : undefined,
            pendingImageTaskId: result.stillPending[0]?.taskId,
            message: result.stillPending.length
              ? `${result.stillPending.length} 个任务仍在后台`
              : undefined,
            lastResult: {
              count: nextUrls.length,
              urls: nextUrls,
            },
          },
        });
        toastSuccess(`已取回 ${result.urls.length} 张后台图片`);
        appendLog(`继续查询完成 · 取回 ${result.urls.length}`);
      } else {
        handlePatch({
          status: result.stillPending.length ? 'running' : 'idle',
          pendingImageTasks: result.stillPending.length ? result.stillPending : undefined,
          pendingImageTaskId: result.stillPending[0]?.taskId,
          message: result.stillPending.length
            ? `${result.stillPending.length} 个任务仍在后台`
            : undefined,
        });
        if (result.stillPending.length) {
          appendLog('任务仍在生成，请稍后再查');
        } else {
          toastError('后台图片任务已失败或过期');
        }
      }
    } catch (e) {
      if (controller.signal.aborted) appendLog('已停止查询');
      else toastError(String(e));
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
    }
  }, [appendLog, blockId, data, edges, handlePatch, nodes, previewUrls, updateNodeData]);

  const handleUploadRef = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/') || !f.type);
      if (!list.length) return;

      const existing = resolveUploadedReferenceUrls(data);
      const room = Math.max(0, MAX_PICTURE_UPLOAD_REFS - existing.length);
      if (room <= 0) {
        toastError(`参考图最多 ${MAX_PICTURE_UPLOAD_REFS} 张`);
        return;
      }
      const toUpload = list.slice(0, room);
      if (list.length > room) {
        toastError(`参考图最多 ${MAX_PICTURE_UPLOAD_REFS} 张，已忽略多余 ${list.length - room} 张`);
      }

      setRefBusy(true);
      try {
        const uploaded: string[] = [];
        for (const file of toUpload) {
          const res = await api.uploadAsset(file);
          if (res.url?.trim()) uploaded.push(res.url.trim());
        }
        if (!uploaded.length) return;
        const next = [...existing];
        for (const url of uploaded) {
          if (!next.includes(url)) next.push(url);
        }
        handlePatch(patchUploadedReferenceUrls(next, pictureGenMode, proActionId));
        if (uploaded.length > 1) {
          toastSuccess(`已添加 ${uploaded.length} 张参考图`);
        }
      } finally {
        setRefBusy(false);
      }
    },
    [data, handlePatch, pictureGenMode, proActionId],
  );

  /** PG-03: 上传风格参考图（单张，写 styleImageUrl 并锁定风格参考模式） */
  const handleUploadStyle = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files).find((f) => f.type.startsWith('image/') || !f.type);
      if (!file) return;
      setRefBusy(true);
      try {
        const res = await api.uploadAsset(file);
        const url = res.url?.trim();
        if (!url) return;
        handlePatch(patchStyleImageUrl(url, data));
        appendLog('已设置风格参考图 · 风格参考模式');
        toastSuccess('已设置风格参考图：主体写在提示词里，画风由风格图控制');
      } finally {
        setRefBusy(false);
      }
    },
    [appendLog, data, handlePatch],
  );

  const styleImageUrl = ((data.styleImageUrl as string | undefined) ?? '').trim();

  /** 从红框移除本节点上传的参考图 / 风格图（不碰上游） */
  const handleRemoveUploadRef = useCallback(
    (url: string) => {
      if (styleImageUrl && styleImageUrl === url) {
        handlePatch(patchStyleImageUrl(undefined, data));
        return;
      }
      const next = resolveUploadedReferenceUrls(data).filter((u) => u !== url);
      handlePatch(patchUploadedReferenceUrls(next, pictureGenMode, proActionId));
    },
    [data, handlePatch, pictureGenMode, proActionId, styleImageUrl],
  );

  /** 在提示词光标处插入 @上游/@生成 */
  const insertLocalMediaAtCursor = useCallback(
    (kind: 'generated' | 'upstream', index0: number) => {
      const ta = promptContainerRef.current?.querySelector('textarea');
      const start = ta?.selectionStart ?? draft.length;
      const end = ta?.selectionEnd ?? start;
      const label = `图${index0 + 1}`;
      const { value: next, cursor: nextCursor } = insertLocalMediaMentionAtSelection(
        draft,
        start,
        kind,
        label,
        end,
      );
      onChange(next);
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [draft, onChange],
  );

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;

    // PG-09: 未配置图片连接时前置拦截，不再发注定失败的请求
    if (!hasPictureConnections) {
      toastError('未配置图片模型连接：请先在「设置 → 连接」添加图片模型');
      openConnectionsSettings();
      return;
    }

    // 基础路径：按「上传 + 上游参考」自动文生图 / 图生图 / 多参考，无需进专业工具点选
    const excluded = new Set(
      ((data.excludedRefUrls as string[]) ?? []).filter(Boolean),
    );
    const effectiveRefs = [
      ...resolvePictureReferenceUrls(data),
      ...upstreamPictures.filter((u) => u && !excluded.has(u)),
      ...predictedSend.injected.map((i) => i.url).filter((u) => !excluded.has(u)),
    ];
    const runtimeMode = resolveRuntimePictureGenMode(data, effectiveRefs);
    const prePatch: Record<string, unknown> = {
      ...patchPictureGenMode(runtimeMode, data),
    };
    if (proActionId === 'text-to-image' || proActionId === 'image-to-image') {
      prePatch.pictureProAction = undefined;
      prePatch.pictureProActionLabel = undefined;
    }

    if (isPictureMultiPromptAction(proActionId)) {
      const slots = normalizeMultiPrompts(data.multiPrompts, draft);
      const filled = filledMultiPrompts(slots);
      if (filled.length === 0) {
        toastError('请至少填写一条多图提示词');
        return;
      }
      prePatch.multiPrompts = slots;
      prePatch.imageCount = filled.length;
      prePatch.runPrompt = filled[0];
    } else {
      // 底栏已去掉「N张」：普通路径固定 1 张；多张走「生成多图」
      prePatch.imageCount = 1;
    }

    // 纯文生图时，图生图专用模型（如 flux-i2i）自动换成可文生的模型
    if (runtimeMode === 'text-to-image' || runtimeMode === 'panorama-720') {
      const def = resolvePictureModelForRequest(model);
      if (def.provider === 'fal' && def.supportsReference) {
        prePatch.model = 'flux-dev';
      }
    }
    // PG-15: 风格参考需要多图；fal 文生图端点吃不到参考 → 切 Gemini
    if (
      runtimeMode === 'style-ref' ||
      runtimeMode === 'image-to-image' ||
      runtimeMode === 'multi-ref'
    ) {
      const def = resolvePictureModelForRequest(
        typeof prePatch.model === 'string' ? prePatch.model : model,
      );
      if (def.provider === 'fal' && (runtimeMode === 'style-ref' || !def.supportsReference)) {
        prePatch.model = 'gemini-2.5-flash-image';
        appendLog('当前模型无法完整使用风格/参考图，已切换为 Gemini');
      }
    }
    // 运行前把专业模板拼进 content（仅当有专业动作；多图模式按条处理）
    if (proAction?.promptSuffix && !isPictureMultiPromptAction(proActionId)) {
      const composed = composePictureProPrompt(draft, proAction);
      if (composed !== draft) {
        prePatch.runPrompt = composed;
      }
    }
    updateNodeData(blockId, prePatch);

    // PG-04: 每次运行持有可中断的控制器（按 blockId 登记，防 remount 丢 ref）
    runAbortRef.current?.abort();
    const controller = beginBlockRunAbort(blockId);
    runAbortRef.current = controller;

    try {
      const { runCascadeFromBlock } = await import('../../../../execution/cascade-runner');
      await runCascadeFromBlock({
        blockId,
        nodes: runtime.getNodes(),
        edges: runtime.getEdges(),
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            runtime.setEdges(updater(runtime.getEdges()));
          }
        },
        updateNodeData: (id, patch) => runtime.updateNodeData(id, patch),
        signal: {
          get cancelled() {
            return controller.signal.aborted;
          },
          abortSignal: controller.signal,
        },
      });
      const filledCount = isPictureMultiPromptAction(proActionId)
        ? filledMultiPrompts(data.multiPrompts).length
        : 0;
      const modeLabel = isPictureMultiPromptAction(proActionId)
        ? `多图 ×${filledCount || imageCount}`
        : runtimeMode === 'image-to-image'
          ? '图生图'
          : runtimeMode === 'multi-ref'
            ? '多参考'
            : runtimeMode === 'text-to-image'
              ? '文生图'
              : proAction?.label;
      appendLog(
        modeLabel
          ? `运行 · ${modeLabel}`
          : `运行 · ${meta?.label ?? kind}`,
      );
      const last = runtime.getNodes().find((n) => n.id === blockId)?.data as
        | Record<string, unknown>
        | undefined;
      const truncated = (last?.lastResult as { truncatedRefs?: number } | undefined)?.truncatedRefs;
      if (truncated && truncated > 0) {
        toastError(`参考图已按模型上限裁掉 ${truncated} 张（风格图优先保留）`);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        appendLog('已停止生成');
      } else {
        appendLog(`运行失败: ${String(e)}`);
      }
    } finally {
      endBlockRunAbort(blockId, controller);
      if (runAbortRef.current === controller) runAbortRef.current = null;
      updateNodeData(blockId, { runPrompt: undefined });
    }
  }, [
    flushNow,
    runtime,
    hasPictureConnections,
    openConnectionsSettings,
    proAction,
    proActionId,
    draft,
    data,
    upstreamPictures,
    model,
    updateNodeData,
    blockId,
    appendLog,
    meta,
    kind,
    imageCount,
  ]);

  /** PG-04: 停止生成 — 中断在途请求并把节点状态收回 idle（即使 remount 丢了 ref 也要能停） */
  const handleStop = useCallback(() => {
    const hadController = abortBlockRun(blockId) || Boolean(runAbortRef.current);
    if (runAbortRef.current) {
      runAbortRef.current.abort();
      runAbortRef.current = null;
    }
    // 无控制器时也必须收回 idle：否则 Stop 按钮会一直显示且点击无任何反馈
    updateNodeData(blockId, {
      status: 'idle',
      error: undefined,
      message: undefined,
      batchProgress: undefined,
    });
    appendLog(hadController ? '已停止生成' : '已停止（收回空闲）');
  }, [appendLog, blockId, updateNodeData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      const root = promptContainerRef.current;
      if (!root) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLTextAreaElement) || !root.contains(active)) return;
      e.preventDefault();
      void handleRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun]);

  const handleCollapse = useCallback(() => {
    flushNow();
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse, flushNow]);

  const excludedRefUrls = (data.excludedRefUrls as string[]) ?? [];
  const uploadRefUrls = useMemo(() => resolveUploadedReferenceUrls(data), [data]);
  const allRefUrls = useMemo(() => resolvePictureReferenceUrls(data), [data]);
  const linkedShotForPreview = useMemo(() => {
    const id = (data.linkedShotId as string | undefined)?.trim();
    return (id ? shots.find((s) => s.id === id) : undefined) ?? shots[0];
  }, [data.linkedShotId, shots]);

  /** PG-38: 与执行器同源的发送参考预判（含定妆/场景注入），UI 据此展示真实模式与注入图 */
  const predictedSend = useMemo(() => {
    const charCtx = buildCharacterContext(data, linkedShotForPreview, libraryCharacters, upstreamPictures);
    const env = (environments?.environments ?? []).find(
      (e) =>
        (linkedShotForPreview?.sceneCode && e.sceneCode === linkedShotForPreview.sceneCode) ||
        (linkedShotForPreview?.sceneAssetId && e.id === linkedShotForPreview.sceneAssetId),
    ) as { referenceUrls?: string[]; referenceImageUrl?: string } | undefined;
    const envRef = env
      ? (env.referenceUrls?.[0] ?? env.referenceImageUrl)?.trim() || undefined
      : undefined;
    return resolvePictureSendRefs({
      data,
      nodeRef: (data.referenceImageUrl as string | undefined)?.trim(),
      multiRefs: Array.isArray(data.referenceImageUrls)
        ? (data.referenceImageUrls as string[])
        : [],
      styleImageUrl: (data.styleImageUrl as string | undefined)?.trim(),
      upstreamPics: upstreamPictures.filter((u) => u && !excludedRefUrls.includes(u)),
      mentionRefs: resolveLocalMediaMentionUrls(
        draft,
        previewUrls,
        upstreamPictures.filter((u) => u && !excludedRefUrls.includes(u)),
      ),
      characterRef: charCtx.referenceImageUrl,
      envRef,
    });
  }, [
    data,
    draft,
    environments,
    libraryCharacters,
    linkedShotForPreview,
    previewUrls,
    upstreamPictures,
  ]);

  const refStripItems = useMemo((): PictureRefItem[] => {
    const items: PictureRefItem[] = [];
    const seen = new Set<string>();
    // 展示：上传主体参考 + 风格图（带风格标记）
    allRefUrls.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        url,
        source: 'upload',
        index,
        ...(styleImageUrl && url === styleImageUrl ? { role: 'style' as const } : {}),
      });
    });
    upstreamPictures.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, source: 'upstream', index });
    });
    const excludedSet = new Set(excludedRefUrls.filter(Boolean));
    const injected = [
      ...((data.injectedRefs as PictureInjectedRef[] | undefined) ?? []),
      ...predictedSend.injected,
    ];
    injected.forEach((item, index) => {
      if (!item?.url || seen.has(item.url) || excludedSet.has(item.url)) return;
      seen.add(item.url);
      items.push({ url: item.url, source: 'injected', index, role: item.role });
    });
    return items;
  }, [allRefUrls, data.injectedRefs, excludedRefUrls, predictedSend, styleImageUrl, upstreamPictures]);

  // PG-11: 上游断开后清掉残留的排除项，避免节点 data 无限增长。
  // 仅在仍有上游图时清理，防止图迁移/断连瞬间把合法排除项误清空。
  useEffect(() => {
    if (excludedRefUrls.length === 0 || upstreamPictures.length === 0) return;
    const alive = excludedRefUrls.filter((u) => upstreamPictures.includes(u));
    if (alive.length !== excludedRefUrls.length) {
      handlePatch({ excludedRefUrls: alive });
    }
  }, [excludedRefUrls, handlePatch, upstreamPictures]);

  // 参考图变化时自动同步基础模式（专业玩法锁定时不改）
  useEffect(() => {
    const excluded = new Set(excludedRefUrls.filter(Boolean));
    // PG-38: 与发送预判同源（含当前定妆/场景注入），历史 injectedRefs 不参与模式计算
    const effective = predictedSend.visibleForMode.filter((u) => u && !excluded.has(u));
    const nextMode = resolveRuntimePictureGenMode(data, effective);
    if (nextMode === pictureGenMode) return;
    const patch: Record<string, unknown> = patchPictureGenMode(nextMode, data);
    // 清掉已无意义的「文生图/图生图」专业标记，避免 UI 仍显示旧工具名
    if (proActionId === 'text-to-image' || proActionId === 'image-to-image') {
      patch.pictureProAction = undefined;
      patch.pictureProActionLabel = undefined;
    }
    handlePatch(patch);
  }, [
    data,
    excludedRefUrls,
    handlePatch,
    pictureGenMode,
    proActionId,
    predictedSend,
  ]);

  const localMedia = useMemo(
    () => buildLocalMediaItems(previewUrls, upstreamPictures),
    [previewUrls, upstreamPictures],
  );
  const runtimeDisplayMode = predictedSend.mode;

  const mentionedUpstreamUrls = useMemo(
    () => resolveLocalMediaMentionUrls(draft, previewUrls, upstreamPictures).filter((u) =>
      upstreamPictures.includes(u),
    ),
    [draft, previewUrls, upstreamPictures],
  );

  const placeholder = proAction?.defaultPromptHint
    ? proAction.defaultPromptHint
    : runtimeDisplayMode === 'style-ref'
      ? '描述主体内容… 风格由参考图控制 · 输入 @ 或点击上游图插入引用'
      : runtimeDisplayMode === 'multi-ref'
        ? '描述如何融合多张参考… 输入 @ 或点击上游/生成图插入'
        : runtimeDisplayMode === 'image-to-image'
          ? '描述想改成什么样… 输入 @ 或点击上游图插入引用'
          : runtimeDisplayMode === 'upscale-hd'
            ? '放大不使用提示词，可留空'
            : '描述你想生成的图像… 输入 @ 引用角色/场景，或点击上游图插入';

  const toolbarLeft = (
    <div className="flex items-center gap-1 flex-wrap min-w-0" onMouseDown={stop}>
      {/* + 参考文件：写入 referenceImageUrl，并在上方「参考图」区与上游一并展示 */}
      <button
        type="button"
        onMouseDown={stop}
        disabled={refBusy}
        onClick={() => refInputRef.current?.click()}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
          uploadRefUrls.length > 0
            ? 'bg-brand/10 text-brand'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
        title={`上传参考图（可多选，最多 ${MAX_PICTURE_UPLOAD_REFS} 张）`}
      >
        <ImagePlus size={12} />
        参考
        {uploadRefUrls.length > 0 ? (
          <span className="tabular-nums opacity-80">×{uploadRefUrls.length}</span>
        ) : null}
        {uploadRefUrls.length > 0 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handlePatch(patchUploadedReferenceUrls([], pictureGenMode, proActionId));
            }}
            className="ml-0.5 opacity-60 hover:opacity-100"
            title="清除全部上传参考"
          >
            <X size={10} />
          </span>
        ) : null}
      </button>
      <input
        ref={refInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void handleUploadRef(files);
          e.target.value = '';
        }}
      />

      {/* PG-03: 风格参考图 — 写入 styleImageUrl 并锁定风格参考模式 */}
      <button
        type="button"
        onMouseDown={stop}
        disabled={refBusy}
        onClick={() => styleInputRef.current?.click()}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
          styleImageUrl
            ? 'bg-violet-500/10 text-violet-700'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
        title="上传风格参考图：画风由风格图控制，主体写在提示词里"
      >
        <Palette size={12} />
        风格
        {styleImageUrl ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handlePatch(patchStyleImageUrl(undefined, data));
            }}
            className="ml-0.5 opacity-60 hover:opacity-100"
            title="清除风格图"
          >
            <X size={10} />
          </span>
        ) : null}
      </button>
      <input
        ref={styleInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) void handleUploadStyle(files);
          e.target.value = '';
        }}
      />

      <span className="w-px h-3.5 bg-line/50" />

      <PictureParamChips blockId={blockId} onPatch={handlePatch} />
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2.5">
      <div className="rounded-lg bg-surface/60 px-2 py-1.5 text-[10px] text-ink/50 leading-relaxed">
        {proAction ? (
          <>
            <span className="text-brand font-medium">{proAction.label}</span>
            {' · '}
            {proAction.hint}
          </>
        ) : (
          runtimeDisplayMode === 'style-ref'
            ? '风格参考'
            : runtimeDisplayMode === 'multi-ref'
              ? '多参考'
              : runtimeDisplayMode === 'image-to-image'
                ? '图生图'
                : '文生图'
        )}
        {' · '}
        {modelDef.label} · {resolvedSize.size}
        {multiPromptMode
          ? ` · 多图 ×${Math.max(1, filledMultiPrompts(multiPrompts).length || multiPrompts.length)}`
          : ''}
      </div>

      {aspectRatio === 'custom' && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-ink/50">
            W
            <input
              type="number"
              min={256}
              max={4096}
              value={customW}
              onChange={(e) => handlePatch({ width: Number(e.target.value) || 1024 })}
              onMouseDown={stop}
              className="w-16 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            />
          </label>
          <span className="text-ink/30 text-[10px]">×</span>
          <label className="flex items-center gap-1 text-[10px] text-ink/50">
            H
            <input
              type="number"
              min={256}
              max={4096}
              value={customH}
              onChange={(e) => handlePatch({ height: Number(e.target.value) || 1024 })}
              onMouseDown={stop}
              className="w-16 rounded-lg border border-line/50 px-1.5 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-ink/45 ml-auto">
            <input
              type="checkbox"
              checked={snapToStep}
              onChange={(e) => handlePatch({ snapToStep: e.target.checked })}
              onMouseDown={stop}
            />
            16px
          </label>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          Seed
          {!seedSupported && (
            <span className="ml-1 text-[9px] text-amber-600/80">
              当前模型不支持（仅 FLUX / fal 系生效）
            </span>
          )}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={data.seed != null ? String(data.seed) : ''}
          onChange={(e) => {
            // PG-11: 只接受数字，非法输入不静默变 NaN
            const raw = e.target.value.trim();
            if (raw === '') {
              handlePatch({ seed: undefined });
              return;
            }
            if (!/^\d+$/.test(raw)) return;
            handlePatch({ seed: Number(raw) });
          }}
          onMouseDown={stop}
          disabled={!seedSupported}
          placeholder={seedSupported ? '留空随机' : '当前模型不生效'}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40 disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">
          Negative Prompt
          <span className="ml-1 text-[9px] text-ink/35">
            {modelDef.provider === 'fal'
              ? 'FLUX 系走原生负面参数'
              : '当前模型以提示词文本注入（弱约束）'}
          </span>
        </span>
        <textarea
          value={(data.negativePrompt as string) ?? ''}
          onChange={(e) => handlePatch({ negativePrompt: e.target.value })}
          onMouseDown={stop}
          placeholder="排除元素：文字、水印、畸形…"
          rows={2}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none focus:outline-none focus:border-brand/40"
        />
      </label>

      <div className="space-y-1">
        <span className="text-[10px] text-ink/45">宽高比快捷</span>
        <div className="flex flex-wrap gap-1">
          {IMAGE_ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={stop}
              onClick={() => handlePatch({ aspectRatio: opt.id })}
              className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${
                aspectRatio === opt.id
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-line/40 text-ink/50 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const hasGenerated = previewUrls.length > 0;
  const batchFailures = Array.isArray(
    (data.lastResult as { failures?: { index: number; error: string }[] } | undefined)?.failures,
  )
    ? ((data.lastResult as { failures: { index: number; error: string }[] }).failures)
    : [];
  const hasFailures = batchFailures.length > 0;
  const hasRefs =
    refStripItems.length > 0 || excludedRefUrls.length > 0;
  const showMediaRow = hasGenerated || hasRefs || hasFailures;

  const pendingImageTaskId = (data.pendingImageTaskId as string | undefined)?.trim();
  const pendingImageTasks = Array.isArray(data.pendingImageTasks)
    ? (data.pendingImageTasks as PendingImageTask[])
    : [];
  const hasPendingImage =
    Boolean(pendingImageTaskId) || pendingImageTasks.length > 0;
  const linkedShotLabel = (data.linkedShotLabel as string | undefined)?.trim();

  const topSlot = (
    <>
      {hasUpstream && shots.length > 1 ? (
        <div className="mx-3 mt-2 flex items-center gap-2 text-[10px] text-ink/45">
          <span>写回镜头</span>
          <select
            value={(data.linkedShotId as string | undefined) ?? shotIds[0] ?? ''}
            onMouseDown={stop}
            onChange={(e) => {
              const id = e.target.value;
              const s = shots.find((shot) => shot.id === id);
              updateNodeData(blockId, {
                linkedShotId: id,
                linkedShotLabel: s
                  ? `写回第 ${shots.indexOf(s) + 1} / ${shots.length} 镜（#${(s.index ?? 0) + 1}）`
                  : undefined,
              });
            }}
            className="rounded-md border border-line/40 bg-surface px-1.5 py-0.5 text-[10px] text-ink/80 focus:outline-none"
          >
            {shots.map((s, i) => (
              <option key={s.id} value={s.id}>
                第 {i + 1} / {shots.length} 镜 · #{((s.index ?? 0) + 1)}
              </option>
            ))}
          </select>
          {linkedShotLabel ? <span>{linkedShotLabel}</span> : null}
        </div>
      ) : linkedShotLabel && hasUpstream ? (
        <div className="mx-3 mt-2 text-[10px] text-ink/45">{linkedShotLabel}</div>
      ) : null}
      {hasPendingImage && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-1.5">
          <span className="text-[10px] text-amber-800 flex-1">
            有图片任务仍在后台生成，超时后结果可取回
          </span>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => void handleResumePending()}
            className="text-[10px] font-medium text-amber-800 hover:text-brand"
          >
            继续查询
          </button>
        </div>
      )}
      {(data.message as string | undefined)?.trim() ? (
        <div className="mx-3 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-800">
          {String(data.message)}
        </div>
      ) : null}
      {/* 一排两列：左生成结果 · 右参考图（本节点上传 + 上游传入）；单侧有内容则全宽 */}
      {showMediaRow && (
        <div
          className="mx-3 mt-2 flex items-start gap-3 pb-2 border-b border-line/20"
          onMouseDown={stop}
        >
          {(hasGenerated || hasFailures) && (
            <div className={hasRefs ? 'min-w-0 flex-1' : 'min-w-0 w-full'}>
              <PictureResultGallery
                urls={previewUrls}
                selectedIndex={Math.min(selectedResult, Math.max(0, previewUrls.length - 1))}
                onSelect={setSelectedResult}
                onDelete={handleDeleteGenerated}
                onSaveToLibrary={handleSaveToLibrary}
                onSaveToCharacter={handleSaveToCharacter}
                characters={libraryCharacters
                  .filter((c) => !c.deletedAt)
                  .map((c) => ({ id: c.id, name: c.name }))}
                history={readPictureGenerationHistory(data)}
                onRestoreHistory={handleRestoreHistory}
                onRestorePrompt={handleRestorePrompt}
                failures={batchFailures}
                sourceBlockId={blockId}
                compiledPromptsByUrl={compiledPromptsByUrl}
                compiledPrompt={
                  typeof data.lastCompiledPrompt === 'string'
                    ? data.lastCompiledPrompt
                    : undefined
                }
              />
            </div>
          )}
          {(hasGenerated || hasFailures) && hasRefs && (
            <div className="w-px self-stretch bg-line/25 shrink-0" aria-hidden />
          )}
          {hasRefs && (
            <div className={hasGenerated || hasFailures ? 'min-w-0 flex-1' : 'min-w-0 w-full'}>
              <PictureUpstreamStrip
                items={refStripItems}
                mentionedUrls={mentionedUpstreamUrls}
                excludedUrls={excludedRefUrls}
                sourceBlockId={blockId}
                onSelectUpstream={(_url, index) => insertLocalMediaAtCursor('upstream', index)}
                onExcludeUpstream={(url) => {
                  if (excludedRefUrls.includes(url)) {
                    handlePatch({
                      excludedRefUrls: excludedRefUrls.filter((u) => u !== url),
                    });
                  } else {
                    handlePatch({ excludedRefUrls: [...excludedRefUrls, url] });
                  }
                }}
                onRemoveUpload={handleRemoveUploadRef}
                onRestoreExcluded={() => handlePatch({ excludedRefUrls: [] })}
              />
            </div>
          )}
        </div>
      )}

      {/* 专业动作芯片 */}
      {proAction && (
        <div className="mx-3 mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 text-[10px] font-medium border border-violet-500/20">
            {proAction.label}
            <button
              type="button"
              onMouseDown={stop}
              onClick={handleClearProAction}
              className="opacity-60 hover:opacity-100"
              title="清除专业工具"
            >
              <X size={10} />
            </button>
          </span>
          <span className="text-[9px] text-ink/40 truncate">{proAction.hint}</span>
        </div>
      )}

      {/* 放大/全景可能只锁 mode 而无专业芯片：给退出入口，避免卡在「本地插值放大」 */}
      {!proAction && (pictureGenMode === 'upscale-hd' || pictureGenMode === 'panorama-720') && (
        <div className="mx-3 mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 text-[10px] font-medium border border-violet-500/20">
            {pictureGenMode === 'upscale-hd' ? '图片放大' : '720° 全景'}
            <button
              type="button"
              onMouseDown={stop}
              onClick={handleClearProAction}
              className="opacity-60 hover:opacity-100"
              title="退出专业模式"
            >
              <X size={10} />
            </button>
          </span>
        </div>
      )}

      {pictureGenMode === 'panorama-720' && (
        <div className="mx-3 mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-2 text-[10px] text-sky-800">
          720° 全景会生成标准 360×180、2:1 等距柱状环境图。建议只描述场景，人物在 3D
          导演台中实时放置。
        </div>
      )}

      {!proAction && uploadRefUrls.length === 0 && upstreamPictures.length === 0 && previewUrls.length === 0 && (
        <div className="mx-3 mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-ink/40">
          <span>快捷：</span>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => {
              const a = lookupPictureProAction('upscale-hd');
              if (a) handleSelectProAction(a);
              if (pictureGenMode !== 'upscale-hd') refInputRef.current?.click();
            }}
            className={
              pictureGenMode === 'upscale-hd'
                ? 'text-brand font-medium'
                : 'text-ink/55 hover:text-brand'
            }
          >
            图片放大
          </button>
          <span className="text-ink/20">·</span>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => {
              const a = lookupPictureProAction('multi-prompt');
              if (a) handleSelectProAction(a);
            }}
            className="text-ink/55 hover:text-brand"
          >
            生成多图
          </button>
          <span className="text-ink/20">·</span>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => {
              const a = lookupPictureProAction('director-storyboard');
              if (a) handleSelectProAction(a);
            }}
            className="text-ink/55 hover:text-brand"
          >
            调度故事板
          </button>
        </div>
      )}
    </>
  );

  const batchProgress = data.batchProgress as { done?: number; total?: number } | undefined;
  const runLabel =
    status === 'running' && batchProgress && (batchProgress.total ?? 0) > 1
      ? `生成 ${batchProgress.done ?? 0}/${batchProgress.total}`
      : pictureGenMode === 'upscale-hd'
        ? '插值放大'
        : multiPromptMode
          ? `生成 ×${Math.max(1, filledMultiPrompts(multiPrompts).length || multiPrompts.length)}`
          : proAction
            ? `生成 · ${proAction.label.slice(0, 6)}`
            : '生成';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      headerTrailing={
        <div className="flex items-center gap-1" onMouseDown={stop}>
          <PictureProActionMenu
            activeId={proActionId}
            onSelect={handleSelectProAction}
            variant="header"
          />
          {pictureGenMode === 'upscale-hd' ? (
            /* PG-06: 插值放大不走生成模型，隐藏模型选择避免误导 */
            <span className="text-[10px] text-ink/40 px-2 py-0.5 rounded-md bg-surface/70">
              本地插值放大 · 不使用生成模型
            </span>
          ) : (
            <ComposerModelSelect
              value={model}
              options={
                pictureModelOptions.length > 0
                  ? pictureModelOptions
                  : [{ id: model, label: '未配置图片连接 · 点此去设置' }]
              }
              onChange={(v) => {
                if (!hasPictureConnections) {
                  openConnectionsSettings();
                  return;
                }
                void selectPictureModel(v, (id) => handlePatch({ model: id }));
              }}
              width={260}
              tone="desk"
            />
          )}
        </div>
      }
      topSlot={topSlot}
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      onStop={handleStop}
      running={data.status === 'running'}
      runLabel={runLabel}
      promptContainerRef={promptContainerRef}
      heightClass="h-auto"
      bodyClassName={
        multiPromptMode
          ? 'px-3 pt-2.5 pb-2 overflow-visible'
          : 'shrink-0 h-[120px] px-3 pt-2 pb-1 overflow-hidden'
      }
    >
      {multiPromptMode ? (
        <PictureMultiPromptEditor
          prompts={multiPrompts}
          onChange={handleMultiPromptsChange}
          placeholder={proAction?.defaultPromptHint}
          localMedia={localMedia}
        />
      ) : (
        <AssetMentionInput
          as="textarea"
          value={draft}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          kinds={PICTURE_MENTION_KINDS}
          localMedia={localMedia}
          highlightMentions
          className={COMPOSER_PROMPT_TEXTAREA_CLASS}
          tone="desk"
        />
      )}
    </ComposerWorkspaceShell>
  );
}
