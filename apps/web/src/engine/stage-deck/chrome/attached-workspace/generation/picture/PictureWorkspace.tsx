import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import {
  IMAGE_ASPECT_OPTIONS,
  lookupBlock,
  resolveImageRequestSize,
  resolvePictureModelForRequest,
} from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { ImagePlus, X } from 'lucide-react';
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
  readPictureGenMode,
  patchUploadedReferenceUrls,
  resolvePictureReferenceUrls,
  resolveRuntimePictureGenMode,
  resolveUploadedReferenceUrls,
} from './picture-gen-modes';

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
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const { pictures: upstreamPictures } = useUpstreamMedia(blockId);
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

  const modelDef = resolvePictureModelForRequest(model);
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

  const handleSelectProAction = useCallback(
    (action: PictureProActionDef) => {
      const patch = buildPictureProActionPatch(action);
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
        const first = filledMultiPrompts(seeded)[0];
        if (first) patch.content = first;
      }
      // 空 prompt 时用动作 hint 作 placeholder 引导；不强制覆盖已有正文
      handlePatch(patch);
      appendLog(`图像专业工具 · ${action.label}`);
    },
    [appendLog, data.multiPrompts, draft, handlePatch, model],
  );

  const handleMultiPromptsChange = useCallback(
    (next: string[]) => {
      const normalized = normalizeMultiPrompts(next);
      const filled = filledMultiPrompts(normalized);
      handlePatch({
        multiPrompts: normalized,
        imageCount: Math.max(1, filled.length || normalized.length),
        content: filled[0] ?? '',
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
        toastSuccess('已移入资产回收站');
      }
      appendLog(`已移入回收站 · 生成图 ${index + 1}`);
    },
    [appendLog, blockId, handlePatch, previewUrls],
  );

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

  /** 从红框移除本节点上传的参考图（不碰上游） */
  const handleRemoveUploadRef = useCallback(
    (url: string) => {
      const next = resolveUploadedReferenceUrls(data).filter((u) => u !== url);
      const patch = patchUploadedReferenceUrls(next, pictureGenMode, proActionId);
      if ((data.styleImageUrl as string | undefined)?.trim() === url) {
        patch.styleImageUrl = undefined;
      }
      handlePatch(patch);
    },
    [data, handlePatch, pictureGenMode, proActionId],
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

    // 基础路径：按「上传 + 上游参考」自动文生图 / 图生图 / 多参考，无需进专业工具点选
    const excluded = new Set(
      ((data.excludedRefUrls as string[]) ?? []).filter(Boolean),
    );
    const effectiveRefs = [
      ...resolvePictureReferenceUrls(data),
      ...upstreamPictures.filter((u) => u && !excluded.has(u)),
    ];
    const runtimeMode = resolveRuntimePictureGenMode(data, effectiveRefs);
    const prePatch: Record<string, unknown> = {
      ...patchPictureGenMode(runtimeMode),
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
      prePatch.content = filled[0];
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
    // 运行前把专业模板拼进 content（仅当有专业动作；多图模式按条处理）
    if (proAction?.promptSuffix && !isPictureMultiPromptAction(proActionId)) {
      const composed = composePictureProPrompt(draft, proAction);
      if (composed !== draft) {
        prePatch.content = composed;
      }
    }
    updateNodeData(blockId, prePatch);

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
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [
    flushNow,
    runtime,
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
  const refStripItems = useMemo((): PictureRefItem[] => {
    const items: PictureRefItem[] = [];
    const seen = new Set<string>();
    // 展示：上传主体参考 + 风格图（若有且不重复）
    allRefUrls.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, source: 'upload', index });
    });
    upstreamPictures.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({ url, source: 'upstream', index });
    });
    return items;
  }, [allRefUrls, upstreamPictures]);

  // 参考图变化时自动同步基础模式（专业玩法锁定时不改）
  useEffect(() => {
    const excluded = new Set(excludedRefUrls.filter(Boolean));
    const effective = refStripItems
      .map((i) => i.url)
      .filter((u) => u && !excluded.has(u));
    const nextMode = resolveRuntimePictureGenMode(data, effective);
    if (nextMode === pictureGenMode) return;
    const patch: Record<string, unknown> = patchPictureGenMode(nextMode);
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
    refStripItems,
  ]);

  const localMedia = useMemo(
    () => buildLocalMediaItems(previewUrls, upstreamPictures),
    [previewUrls, upstreamPictures],
  );
  const mentionedUpstreamUrls = useMemo(
    () => resolveLocalMediaMentionUrls(draft, previewUrls, upstreamPictures).filter((u) =>
      upstreamPictures.includes(u),
    ),
    [draft, previewUrls, upstreamPictures],
  );

  const placeholder = proAction?.defaultPromptHint
    ? proAction.defaultPromptHint
    : pictureGenMode === 'style-ref'
      ? '描述主体内容… 风格由参考图控制 · 输入 @ 或点击上游图插入引用'
      : pictureGenMode === 'multi-ref'
        ? '描述如何融合多张参考… 输入 @ 或点击上游/生成图插入'
        : pictureGenMode === 'image-to-image'
          ? '描述想改成什么样… 输入 @ 或点击上游图插入引用'
          : pictureGenMode === 'upscale-hd'
            ? '可选：补充增强方向…'
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
              handlePatch({
                ...patchUploadedReferenceUrls([], pictureGenMode, proActionId),
                styleImageUrl: undefined,
              });
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
          '标准文生图'
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
        <span className="text-[10px] text-ink/45">Seed</span>
        <input
          type="text"
          value={data.seed != null ? String(data.seed) : ''}
          onChange={(e) =>
            handlePatch({ seed: e.target.value ? Number(e.target.value) : undefined })
          }
          onMouseDown={stop}
          placeholder="留空随机"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">Negative Prompt</span>
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
  const hasRefs =
    refStripItems.length > 0 || excludedRefUrls.length > 0;
  const showMediaRow = hasGenerated || hasRefs;

  const topSlot = (
    <>
      {/* 一排两列：左生成结果 · 右参考图（本节点上传 + 上游传入）；单侧有内容则全宽 */}
      {showMediaRow && (
        <div
          className="mx-3 mt-2 flex items-start gap-3 pb-2 border-b border-line/20"
          onMouseDown={stop}
        >
          {hasGenerated && (
            <div className={hasRefs ? 'min-w-0 flex-1' : 'min-w-0 w-full'}>
              <PictureResultGallery
                urls={previewUrls}
                selectedIndex={Math.min(selectedResult, Math.max(0, previewUrls.length - 1))}
                onSelect={setSelectedResult}
                onDelete={handleDeleteGenerated}
                sourceBlockId={blockId}
              />
            </div>
          )}
          {hasGenerated && hasRefs && (
            <div className="w-px self-stretch bg-line/25 shrink-0" aria-hidden />
          )}
          {hasRefs && (
            <div className={hasGenerated ? 'min-w-0 flex-1' : 'min-w-0 w-full'}>
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
              onClick={() =>
                handlePatch({
                  pictureProAction: undefined,
                  pictureProActionLabel: undefined,
                })
              }
              className="opacity-60 hover:opacity-100"
              title="清除专业工具"
            >
              <X size={10} />
            </button>
          </span>
          <span className="text-[9px] text-ink/40 truncate">{proAction.hint}</span>
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
              refInputRef.current?.click();
            }}
            className="text-ink/55 hover:text-brand"
          >
            图片高清
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

  const runLabel =
    pictureGenMode === 'upscale-hd'
      ? '高清放大'
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
        </div>
      }
      topSlot={topSlot}
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
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
