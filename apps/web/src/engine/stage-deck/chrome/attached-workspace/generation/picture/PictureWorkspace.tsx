import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import {
  IMAGE_ASPECT_OPTIONS,
  lookupBlock,
  lookupPictureModel,
  PICTURE_GEN_MODELS,
  resolveImageRequestSize,
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
import { useUpstreamMedia } from '../use-upstream-media';
import { useAttachedNodeData } from '../use-attached-node-data';
import { useLocalNodePrompt } from '../use-local-node-prompt';
import { PictureParamChips } from './PictureParamChips';
import { PictureReferenceStrip } from './PictureReferenceStrip';
import { PictureResultGallery } from './PictureResultGallery';
import { PictureProActionMenu } from './PictureProActionMenu';
import {
  buildPictureProActionPatch,
  composePictureProPrompt,
  lookupPictureProAction,
  type PictureProActionDef,
} from './picture-pro-actions';
import {
  modeNeedsPrimaryRef,
  readPictureGenMode,
  showPictureReferenceStrip,
} from './picture-gen-modes';

const EMPTY_HISTORY: { id: string; blockId: string; text: string; savedAt: number }[] = [];
const PICTURE_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene'];

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
  const { hasMedia, pictures: upstreamPictures } = useUpstreamMedia(blockId);
  const handleAiAction = useWorkspaceAiLog();
  const [selectedResult, setSelectedResult] = useState(0);
  const [refBusy, setRefBusy] = useState(false);
  const [showRefPanel, setShowRefPanel] = useState(false);

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

  const model = (data.model as string) ?? 'dall-e-3';
  const status = (data.status as string) ?? 'idle';
  const pictureGenMode = readPictureGenMode(data);
  const proActionId = (data.pictureProAction as string) || undefined;
  const proAction = lookupPictureProAction(proActionId);
  const quality = (data.quality as string) ?? 'auto';
  const aspectRatio = (data.aspectRatio as string) ?? '1:1';
  const imageCount = (data.imageCount as number) ?? 1;
  const customW = (data.width as number) ?? 1024;
  const customH = (data.height as number) ?? 1024;
  const snapToStep = (data.snapToStep as boolean) ?? true;
  const needsRef =
    modeNeedsPrimaryRef(pictureGenMode) ||
    Boolean(proAction?.needsReference) ||
    pictureGenMode === 'upscale-hd';

  const previewUrls = useMemo(() => {
    const urls = (data.previewUrls as string[] | undefined) ?? [];
    if (urls.length > 0) return urls;
    const single = data.previewUrl as string | undefined;
    return single ? [single] : [];
  }, [data.previewUrl, data.previewUrls]);

  const modelDef = lookupPictureModel(model);
  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? customW : undefined,
    height: aspectRatio === 'custom' ? customH : undefined,
    snapToStep,
  });

  // 有参考或需要参考时展示参考条
  const showReference =
    showRefPanel ||
    showPictureReferenceStrip(pictureGenMode, hasMedia, needsRef) ||
    Boolean(data.referenceImageUrl) ||
    Boolean((data.referenceImageUrls as string[] | undefined)?.length);

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
        !lookupPictureModel(model).supportsReference &&
        action.pictureGenMode !== 'upscale-hd'
      ) {
        patch.model = 'flux-i2i';
      }
      if (action.pictureGenMode === 'panorama-720' && model === 'flux-i2i') {
        patch.model = 'flux-dev';
      }
      // 空 prompt 时用动作 hint 作 placeholder 引导；不强制覆盖已有正文
      handlePatch(patch);
      setShowRefPanel(Boolean(action.needsReference));
      appendLog(`图像专业工具 · ${action.label}`);
    },
    [appendLog, handlePatch, model],
  );

  const handleUploadRef = useCallback(
    async (file: File) => {
      setRefBusy(true);
      try {
        const res = await api.uploadAsset(file);
        handlePatch({
          referenceImageUrl: res.url,
          pictureGenMode:
            pictureGenMode === 'text-to-image' ? 'image-to-image' : pictureGenMode,
          useImageReference: true,
        });
        setShowRefPanel(true);
      } finally {
        setRefBusy(false);
      }
    },
    [handlePatch, pictureGenMode],
  );

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;

    // 运行前把专业模板拼进 content（仅当有专业动作）
    if (proAction?.promptSuffix) {
      const composed = composePictureProPrompt(draft, proAction);
      if (composed !== draft) {
        updateNodeData(blockId, { content: composed });
      }
    }

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
      appendLog(
        proAction
          ? `运行 · ${proAction.label}`
          : `运行 · ${meta?.label ?? kind}`,
      );
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [
    flushNow,
    runtime,
    proAction,
    draft,
    updateNodeData,
    blockId,
    appendLog,
    meta,
    kind,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      const ta = promptContainerRef.current?.querySelector('textarea');
      if (document.activeElement !== ta) return;
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

  const placeholder = proAction?.defaultPromptHint
    ? proAction.defaultPromptHint
    : pictureGenMode === 'style-ref'
      ? '描述主体内容… 风格由参考图控制 · 输入 @ 引用角色/场景'
      : pictureGenMode === 'multi-ref'
        ? '描述如何融合多张参考… 输入 @ 引用角色、场景'
        : pictureGenMode === 'image-to-image'
          ? '描述想改成什么样… 输入 @ 引用角色、场景'
          : pictureGenMode === 'upscale-hd'
            ? '可选：补充增强方向…'
            : '描述你想生成的图像… 输入 @ 引用角色、场景';

  const toolbarLeft = (
    <div className="flex items-center gap-1 flex-wrap min-w-0" onMouseDown={stop}>
      {/* + 参考 — 对齐 LibTV */}
      <button
        type="button"
        onMouseDown={stop}
        disabled={refBusy}
        onClick={() => {
          if (data.referenceImageUrl || showReference) {
            setShowRefPanel((v) => !v);
          } else {
            refInputRef.current?.click();
          }
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
          showReference || data.referenceImageUrl
            ? 'bg-brand/10 text-brand'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
        title="添加参考图"
      >
        <ImagePlus size={12} />
        参考
        {data.referenceImageUrl ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handlePatch({ referenceImageUrl: undefined });
            }}
            className="ml-0.5 opacity-60 hover:opacity-100"
          >
            <X size={10} />
          </span>
        ) : null}
      </button>
      <input
        ref={refInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUploadRef(f);
          e.target.value = '';
        }}
      />

      <span className="w-px h-3.5 bg-line/50" />

      <PictureProActionMenu activeId={proActionId} onSelect={handleSelectProAction} />

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
        {modelDef.label} · {resolvedSize.size} · ×{imageCount}
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

      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">额外张数（1–15）</span>
        <input
          type="number"
          min={1}
          max={15}
          value={imageCount}
          onChange={(e) =>
            handlePatch({
              imageCount: Math.min(15, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          onMouseDown={stop}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
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

  const topSlot = (
    <>
      <PictureResultGallery
        urls={previewUrls}
        selectedIndex={Math.min(selectedResult, Math.max(0, previewUrls.length - 1))}
        onSelect={setSelectedResult}
        emptyHint={
          proAction
            ? `「${proAction.label}」结果将显示在这里`
            : '上传参考或描述画面后点生成'
        }
      />

      {/* 专业动作芯片 — 类似 LibTV 调度故事板标签 */}
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

      {showReference && (
        <PictureReferenceStrip
          blockId={blockId}
          mode={pictureGenMode === 'upscale-hd' ? 'image-to-image' : pictureGenMode}
          referenceImageUrl={data.referenceImageUrl as string | undefined}
          styleImageUrl={data.styleImageUrl as string | undefined}
          referenceImageUrls={(data.referenceImageUrls as string[]) ?? []}
          excludedRefUrls={(data.excludedRefUrls as string[]) ?? []}
          onPatch={handlePatch}
        />
      )}

      {!showReference && !proAction && upstreamPictures.length === 0 && previewUrls.length === 0 && (
        <div className="mx-3 mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-ink/40">
          <span>快捷：</span>
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => {
              const a = lookupPictureProAction('image-to-image');
              if (a) handleSelectProAction(a);
              refInputRef.current?.click();
            }}
            className="text-ink/55 hover:text-brand"
          >
            图生图
          </button>
          <span className="text-ink/20">·</span>
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
      : proAction
        ? `生成 · ${proAction.label.slice(0, 6)}`
        : imageCount > 1
          ? `生成 ×${imageCount}`
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
            options={PICTURE_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
            onChange={(v) => handlePatch({ model: v })}
            width={180}
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
      bodyClassName="shrink-0 h-[120px] px-3 pt-2 pb-1 overflow-hidden"
    >
      <AssetMentionInput
        as="textarea"
        value={draft}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        kinds={PICTURE_MENTION_KINDS}
        className={COMPOSER_PROMPT_TEXTAREA_CLASS}
      />
    </ComposerWorkspaceShell>
  );
}
