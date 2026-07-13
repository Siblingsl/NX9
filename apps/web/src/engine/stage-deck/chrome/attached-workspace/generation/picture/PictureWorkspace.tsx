import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { lookupBlock, PICTURE_GEN_MODELS } from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { AssetMentionInput } from '../../../asset-mention/AssetMentionInput';
import { ComposerModelSelect } from '../../composer/ComposerModelSelect';
import { ComposerWorkspaceShell, COMPOSER_PROMPT_TEXTAREA_CLASS } from '../../composer/ComposerWorkspaceShell';
import { useWorkspaceAiLog } from '../../composer/useWorkspaceAiLog';
import { useDeckUi } from '../../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../../stores/activity-log';
import { usePromptHistory } from '../../../../stores/prompt-history';
import { useUpstreamMedia } from '../use-upstream-media';
import { useAttachedNodeData } from '../use-attached-node-data';
import { useLocalNodePrompt } from '../use-local-node-prompt';
import { PictureGenModeChip } from './PictureGenModeChip';
import { PictureParamChips } from './PictureParamChips';
import { PictureReferenceStrip } from './PictureReferenceStrip';
import {
  patchPictureGenMode,
  readPictureGenMode,
  showPictureReferenceStrip,
  type PictureGenMode,
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
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const { hasMedia } = useUpstreamMedia(blockId);
  const handleAiAction = useWorkspaceAiLog();

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
  const showReference = showPictureReferenceStrip(pictureGenMode, hasMedia);

  useEffect(() => {
    const ta = promptContainerRef.current?.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;
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
      appendLog(`运行 · ${meta?.label ?? kind}`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [blockId, runtime, meta, kind, appendLog, flushNow]);

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

  const toolbarLeft = (
    <div className="flex items-center gap-1" onMouseDown={stop}>
      <PictureGenModeChip
        mode={pictureGenMode}
        onChange={(mode: PictureGenMode) =>
          handlePatch({
            ...patchPictureGenMode(mode),
            ...(mode === 'panorama-720' && model === 'flux-i2i'
              ? { model: 'flux-dev' }
              : {}),
          })
        }
      />
      <span className="w-px h-3.5 bg-line/50" />
      <PictureParamChips blockId={blockId} onPatch={handlePatch} />
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2">
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
          placeholder="排除元素…"
          rows={2}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none focus:outline-none focus:border-brand/40"
        />
      </label>
    </div>
  );

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      headerTrailing={
        <ComposerModelSelect
          value={model}
          options={PICTURE_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
          onChange={(v) => handlePatch({ model: v })}
        />
      }
      topSlot={
        pictureGenMode === 'panorama-720' ? (
          <div className="mx-3 mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-2 text-[10px] text-sky-800">
            720° 全景会生成标准 360×180、2:1 等距柱状环境图。建议只描述场景，人物在
            3D 导演台中实时放置。
          </div>
        ) : showReference ? (
          <PictureReferenceStrip
            blockId={blockId}
            mode={pictureGenMode}
            referenceImageUrl={data.referenceImageUrl as string | undefined}
            onReferenceChange={(url) => handlePatch({ referenceImageUrl: url })}
          />
        ) : undefined
      }
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      running={data.status === 'running'}
      promptContainerRef={promptContainerRef}
    >
      <AssetMentionInput
        as="textarea"
        value={draft}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="描述你想生成的图像… 输入 @ 引用角色、场景"
        kinds={PICTURE_MENTION_KINDS}
        className={COMPOSER_PROMPT_TEXTAREA_CLASS}
      />
    </ComposerWorkspaceShell>
  );
}
