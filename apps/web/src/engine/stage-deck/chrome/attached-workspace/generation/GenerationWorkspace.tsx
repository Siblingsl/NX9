import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Play, History } from 'lucide-react';
import { lookupBlock, resolveNodePromptField, resolveNodePromptText } from '@nx9/shared';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { WorkspaceAiTools } from '../WorkspaceAiTools';
import { PromptComposer } from '../../prompt-bar/PromptComposer';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { usePromptHistory } from '../../../stores/prompt-history';
import { useReactFlow } from '@xyflow/react';
import type { AssetLibraryKind } from '@nx9/shared';

const EMPTY_HISTORY: { blockId: string; text: string }[] = [];

export interface GenerationWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function GenerationWorkspace({ blockId, kind, onCollapse }: GenerationWorkspaceProps) {
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const textareaContainerRef = useRef<HTMLDivElement>(null);
  const promptEntries = usePromptHistory((s) => s.entries);
  const history = useMemo(() => {
    return (promptEntries ?? EMPTY_HISTORY).filter((e) => e.blockId === blockId).slice(0, 20);
  }, [promptEntries, blockId]);
  const { getNode, updateNodeData } = useReactFlow();

  const meta = lookupBlock(kind);
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;

  useEffect(() => {
    if (!textareaContainerRef.current) return;
    const ta = textareaContainerRef.current.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const handleRun = useCallback(async () => {
    if (!runtime) return;
    try {
      const { runCascadeFromBlock } = await import('../../../execution/cascade-runner');
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
  }, [blockId, runtime, meta, kind, appendLog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const active = document.activeElement;
        const inPanel = textareaContainerRef.current?.contains(active);
        if (!inPanel) return;
        e.preventDefault();
        void handleRun();
        return;
      }
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        appendLog('AI 优化（即将推出）');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun, appendLog]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(blockId, patch),
    [blockId, updateNodeData],
  );

  const primaryContent = resolveNodePromptText(data);

  const handlePrimaryChange = useCallback(
    (next: string) => {
      const key = resolveNodePromptField(data);
      handlePatch({ [key]: next });
    },
    [data, handlePatch],
  );

  const assetKinds: AssetLibraryKind[] | undefined = kind === 'sound-gen'
    ? ['character', 'sound']
    : kind === 'prompt'
      ? ['hook']
      : ['character', 'scene'];

  const status = (data.status as string) ?? 'idle';

  const handleAiOptimize = useCallback(() => appendLog('AI 优化（即将推出）'), [appendLog]);
  const handleAiComplete = useCallback(() => appendLog('Prompt 补全（即将推出）'), [appendLog]);
  const handleAiRewrite = useCallback(() => appendLog('AI 重写（即将推出）'), [appendLog]);
  const handleAiTranslate = useCallback(() => appendLog('AI 翻译（即将推出）'), [appendLog]);

  return (
    <div
      className="flex flex-col w-full max-h-[min(420px,50vh)] px-3 py-2.5"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <WorkspaceHeader kind={kind} status={status as any} onCollapse={handleCollapse} />

      <div
        ref={textareaContainerRef}
        className="flex-1 min-h-[140px] overflow-y-auto nowheel overscroll-contain"
      >
        <PromptComposer
          blockId={blockId}
          kind={kind}
          value={primaryContent}
          onChange={handlePrimaryChange}
          placeholder={meta ? `${meta.label} Prompt…` : '输入 Prompt…'}
          data={data}
          onPatch={handlePatch}
          assetKinds={assetKinds}
        />
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 border-t border-line/60 mt-2 nodrag">
        <WorkspaceAiTools
          onOptimize={handleAiOptimize}
          onComplete={handleAiComplete}
          onRewrite={handleAiRewrite}
          onTranslate={handleAiTranslate}
        />

        {history.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-ink/35">
            <History size={11} />
            {history.length} 条历史
          </span>
        )}

        <div className="flex-1 min-w-[8px]" />
        <span className="text-[9px] text-ink/30 hidden sm:inline">Ctrl+Enter</span>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={data.status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-medium hover:bg-brand/90 disabled:opacity-50"
        >
          <Play size={12} />
          运行
        </button>
      </div>
    </div>
  );
}
