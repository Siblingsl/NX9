import type { PlaybookStepDef } from '@nx9/shared';
import type { FlowRuntimeApi } from '../stores/flow-runtime';

export function focusStepNodes(
  step: PlaybookStepDef,
  runtime: FlowRuntimeApi,
): void {
  const kinds = step.canvasNodeKinds ?? [];
  const nodes = runtime.getNodes().filter(
    (n) => kinds.includes(n.type ?? '') || n.data?.playbookStepId === step.id,
  );
  if (nodes.length === 0) return;

  const ids = nodes.map((n) => n.id);
  runtime.fitViewToNodes(ids);
  runtime.highlightNodes(ids, { durationMs: 1200 });
}
