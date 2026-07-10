import { useCallback } from 'react';
import { Play } from 'lucide-react';
import { lookupBlock } from '@nx9/shared';
import { WorkspaceHeader } from '../WorkspaceHeader';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useDeckUi } from '../../../stores/deck-ui';
import { useReactFlow } from '@xyflow/react';

export interface ToolWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ToolWorkspace({ blockId, kind, onCollapse }: ToolWorkspaceProps) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const { getNode } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const meta = lookupBlock(kind);

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
      appendLog(`运行工具 · ${meta?.label ?? kind}`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [blockId, runtime, meta, kind, appendLog]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const status = (data.status as string) ?? 'idle';

  return (
    <div
      className="flex flex-col px-3 py-2.5 max-h-[min(320px,40vh)]"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <WorkspaceHeader kind={kind} status={status as any} onCollapse={handleCollapse} />

      <div className="flex-1 min-h-0 overflow-y-auto nowheel overscroll-contain space-y-2 text-xs text-ink/60">
        <p>输入文件：{((data.inputUrls as string[])?.length ?? 0) > 0 ? `${(data.inputUrls as string[]).length} 个文件` : '等待输入'}</p>
        {(data.outputUrl as string | undefined) && (
          <p>输出：<span className="text-ink/80">{data.outputUrl as string}</span></p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2 pt-2 border-t border-line/60 mt-2 nodrag">
        <div className="flex-1" />
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
