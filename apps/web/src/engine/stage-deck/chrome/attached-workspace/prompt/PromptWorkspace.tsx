import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { lookupBlock } from '@nx9/shared';
import {
  usePromptBatchNodeAdapter,
  usePromptBatchState,
} from '../../../../../blocks/shared/usePromptBatchState';
import { PromptComposer } from '../../prompt-bar/PromptComposer';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { WorkspaceAiTools } from '../WorkspaceAiTools';
import { PromptBatchPanel, type PromptMentionTarget } from './PromptBatchPanel';
import { useDeckUi } from '../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useAssetLibraryModalUi } from '../../../../../stores/asset-library-modal-ui';
import { useWorkspaceCatalog } from '../../../../../stores/workspace-catalog';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PromptWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function PromptWorkspace({ blockId, kind, onCollapse }: PromptWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const openAt = useAssetLibraryModalUi((s) => s.openAt);
  const setLibraryOpen = useAssetLibraryModalUi((s) => s.setOpen);
  const activeProjectId = useWorkspaceCatalog((s) => s.activeId);
  const { getNode, updateNodeData } = useReactFlow();
  const { data, updateNode } = usePromptBatchNodeAdapter(blockId);
  const textareaContainerRef = useRef<HTMLDivElement>(null);
  const [mentionTarget, setMentionTarget] = useState<PromptMentionTarget>('global');

  const batch = usePromptBatchState({ blockId, data, updateNode });
  const meta = lookupBlock(kind);
  const node = getNode(blockId);
  const status = ((node?.data ?? data).status as string) ?? 'idle';
  const canRun = batch.jobs.length > 0 || batch.simplePromptText.trim().length > 0;

  const handleRun = useCallback(async () => {
    if (!runtime || !canRun) return;
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
      appendLog(`运行 · ${meta?.label ?? kind} · ${batch.jobs.length || 1} 项`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [appendLog, batch.jobs.length, blockId, canRun, kind, meta, runtime]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(blockId, patch),
    [blockId, updateNodeData],
  );

  useEffect(() => {
    if (batch.useBatchWorkspace || !textareaContainerRef.current) return;
    const ta = textareaContainerRef.current.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce, batch.useBatchWorkspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun]);

  const openLibrary = useCallback(() => {
    setLibraryOpen(true);
    openAt({ tab: 'character', projectId: activeProjectId ?? undefined });
  }, [activeProjectId, openAt, setLibraryOpen]);

  return (
    <div
      className="flex flex-col w-full max-h-[min(420px,50vh)] px-3 py-2.5"
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      <WorkspaceHeader kind={kind} status={status as any} onCollapse={handleCollapse} />

      <div className="flex-1 min-h-0 overflow-y-auto nowheel overscroll-contain">
        {batch.useBatchWorkspace ? (
          <PromptBatchPanel
            items={batch.items}
            promptMode={batch.promptMode}
            globalPrompt={batch.globalPrompt}
            composeAction={batch.composeAction}
            hasUpstream={batch.hasUpstream}
            hasAssets={batch.hasAssets}
            imageCount={batch.imageCount}
            jobsCount={batch.jobs.length}
            filledCount={batch.filledCount}
            mentionTarget={mentionTarget}
            onMentionTargetChange={setMentionTarget}
            onPersist={batch.persistState}
            onUpdateItem={batch.updateItem}
            onAddItem={batch.addItem}
            onRemoveItem={batch.removeItem}
            onManualSync={batch.handleManualSync}
            onOpenLibrary={openLibrary}
          />
        ) : (
          <div ref={textareaContainerRef} className="space-y-2">
            {batch.hasUpstream && batch.imageCount === 1 && batch.items[0]?.imageUrl && (
              <div className="flex items-center gap-2 px-1">
                <img
                  src={batch.items[0].imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover border border-line/60 shrink-0"
                />
                <span className="text-[10px] text-ink/40">上游素材已关联</span>
                {batch.hasUpstream && (
                  <button
                    type="button"
                    onMouseDown={stop}
                    onClick={batch.handleManualSync}
                    className="text-[10px] text-brand ml-auto hover:underline nodrag nopan"
                  >
                    重新同步
                  </button>
                )}
              </div>
            )}
            <PromptComposer
              blockId={blockId}
              kind={kind}
              value={batch.simplePromptText}
              onChange={batch.setSimplePrompt}
              placeholder={meta ? `${meta.label} Prompt…` : '输入 Prompt…'}
              data={data}
              onPatch={handlePatch}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-2 mt-2 border-t border-line/50 nodrag">
        <WorkspaceAiTools
          onOptimize={() => appendLog('AI 优化（即将推出）')}
          onComplete={() => appendLog('Prompt 补全（即将推出）')}
          onRewrite={() => appendLog('AI 重写（即将推出）')}
          onTranslate={() => appendLog('AI 翻译（即将推出）')}
        />
        <div className="flex-1" />
        <span className="text-[9px] text-ink/30 hidden sm:inline">Ctrl+Enter</span>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={status === 'running' || !canRun}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-medium hover:bg-brand/90 disabled:opacity-40"
        >
          <Play size={12} />
          运行
          {batch.useBatchWorkspace && batch.jobs.length > 0 ? ` (${batch.jobs.length})` : ''}
        </button>
      </div>
    </div>
  );
}
