import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { lookupBlock } from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { AssetMentionInput } from '../../../asset-mention/AssetMentionInput';
import { useDeckUi } from '../../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../../stores/activity-log';
import { usePromptHistory } from '../../../../stores/prompt-history';
import { useUpstreamMedia } from '../use-upstream-media';
import { useAttachedNodeData } from '../use-attached-node-data';
import { useLocalNodePrompt } from '../use-local-node-prompt';
import { PictureWorkspaceHeader } from './PictureWorkspaceHeader';
import { PictureWorkspaceToolbar } from './PictureWorkspaceToolbar';
import { PictureReferenceStrip } from './PictureReferenceStrip';
import {
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
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const { hasMedia } = useUpstreamMedia(blockId);

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
    (text: string) => {
      pushHistory(blockId, text);
    },
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

  const handleAiAction = useCallback(
    (id: string) => {
      const labels: Record<string, string> = {
        optimize: 'AI 优化',
        complete: 'AI 补全',
        rewrite: 'Prompt 重写',
        translate: 'Prompt 翻译',
        shorten: '缩短',
        expand: '扩写',
      };
      appendLog(`${labels[id] ?? id}（即将推出）`);
    },
    [appendLog],
  );

  return (
    <div
      className="flex flex-col w-full h-[340px] max-h-[360px] px-3 py-2 nodrag"
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      <PictureWorkspaceHeader
        kind={kind}
        status={status as any}
        model={model}
        onModelChange={(v) => handlePatch({ model: v })}
        onCollapse={handleCollapse}
      />

      <div
        className="flex-1 min-h-0 mt-1.5 rounded-xl border border-line/35 bg-white shadow-[0_1px_8px_rgba(15,15,15,0.03)] flex flex-col overflow-hidden"
        onMouseDown={stop}
      >
        {showReference && (
          <PictureReferenceStrip
            blockId={blockId}
            mode={pictureGenMode}
            referenceImageUrl={data.referenceImageUrl as string | undefined}
            onReferenceChange={(url) => handlePatch({ referenceImageUrl: url })}
          />
        )}

        <div ref={promptContainerRef} className="flex-1 min-h-0 px-3 pt-2.5 pb-1 overflow-hidden">
          <AssetMentionInput
            as="textarea"
            value={draft}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="描述你想生成的图像… 输入 @ 引用角色、场景"
            kinds={PICTURE_MENTION_KINDS}
            className="w-full h-full min-h-[96px] border-0 text-[13px] leading-relaxed resize-none focus:outline-none bg-transparent text-ink/85 placeholder:text-ink/28 nodrag nopan"
          />
        </div>

        <PictureWorkspaceToolbar
          blockId={blockId}
          data={data}
          onPatch={handlePatch}
          history={history}
          onApplyHistory={applyText}
          onAiAction={handleAiAction}
          onRun={() => void handleRun()}
          running={data.status === 'running'}
        />
      </div>
    </div>
  );
}
