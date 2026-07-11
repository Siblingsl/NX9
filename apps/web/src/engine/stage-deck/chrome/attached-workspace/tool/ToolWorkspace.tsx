import { useCallback } from 'react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useDeckUi } from '../../../stores/deck-ui';
import { useAttachedNodeData } from '../generation/use-attached-node-data';

export interface ToolWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ToolWorkspace({ blockId, kind, onCollapse }: ToolWorkspaceProps) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);
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
  const inputCount = ((data.inputUrls as string[])?.length ?? 0);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      onRun={() => void handleRun()}
      running={data.status === 'running'}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-[240px] max-h-[280px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto nowheel overscroll-contain text-xs text-ink/60"
    >
      <p>输入文件：{inputCount > 0 ? `${inputCount} 个文件` : '等待输入'}</p>
      {(data.outputUrl as string | undefined) && (
        <p className="mt-2">
          输出：<span className="text-ink/80">{data.outputUrl as string}</span>
        </p>
      )}
    </ComposerWorkspaceShell>
  );
}
