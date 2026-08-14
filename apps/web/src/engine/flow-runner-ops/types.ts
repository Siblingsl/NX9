import type { Node, Edge } from '@xyflow/react';
import type { FlowBlock, UpstreamOutputs } from '@nx9/shared';

export interface FlowRunGraphContext {
  nodes: Node[];
  edges: Edge[];
  abortSignal?: AbortSignal;
}

export interface FlowExecuteDeps {
  block: FlowBlock;
  kind: string;
  prompt: string;
  upstream: UpstreamOutputs;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  ctx?: FlowRunGraphContext;
}
