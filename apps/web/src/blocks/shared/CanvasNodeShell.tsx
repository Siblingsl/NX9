import { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BlockShell } from './BlockShell';
import { CanvasNodeBody } from './CanvasNodeBody';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { resolveNodeInteraction, resolveAttachedWorkspace } from '@nx9/shared';
import { NodePromptBarAnchor } from '../../engine/stage-deck/chrome/NodePromptBarAnchor';
import { isSurfaceEnabled } from '../../config/product-surface';

interface CanvasNodeShellProps extends NodeProps {
  alias?: string;
}

/**
 * 紧凑舞台节点卡 + 节点下方跟随工作区（底部工作区）。
 * 注意：不要把 Attached Workspace 改成屏幕弹窗。
 */
export const CanvasNodeShell = memo(function CanvasNodeShell(props: CanvasNodeShellProps) {
  const runtime = useFlowRuntime((s) => s.runtime);
  const kind = props.type ?? 'prompt';
  const data = (props.data ?? {}) as Record<string, unknown>;
  const interaction = resolveNodeInteraction(kind);
  const canvasFirst = isSurfaceEnabled('canvasFirst');
  const canOpenWorkspace =
    isSurfaceEnabled('promptBar') &&
    Boolean(interaction.opensPromptBar) &&
    Boolean(resolveAttachedWorkspace(kind)?.attachToNode);

  const handleRun = useCallback(async () => {
    if (!runtime || !props.id) return;
    try {
      const { runCascadeFromBlock } = await import('../../engine/stage-deck/execution/cascade-runner');
      const nodes = runtime.getNodes();
      const edges = runtime.getEdges();
      await runCascadeFromBlock({
        blockId: props.id,
        nodes,
        edges,
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            runtime.setEdges(updater(runtime.getEdges()));
          }
        },
        updateNodeData: (id, patch) => runtime.updateNodeData(id, patch),
      });
    } catch {
      /* runner logs errors */
    }
  }, [runtime, props.id]);

  const showRun =
    interaction.class === 'input' ||
    interaction.class === 'ai' ||
    interaction.class === 'output';

  return (
    <div className={canvasFirst ? 'relative nx9-node-with-prompt' : undefined}>
      <BlockShell {...props} hideSockets={false}>
        <CanvasNodeBody
          blockId={props.id}
          kind={kind}
          data={data}
          alias={props.alias}
          onRun={showRun ? () => void handleRun() : undefined}
          canOpenWorkspace={canOpenWorkspace}
        />
      </BlockShell>
      {canvasFirst && (resolveAttachedWorkspace(kind)?.attachToNode ?? false) && (
        <NodePromptBarAnchor blockId={props.id} kind={kind} selected={props.selected} />
      )}
    </div>
  );
});
