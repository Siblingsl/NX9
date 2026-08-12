import type { FlowBlock, PromptBatchJob, PromptDispatchMeta } from '@nx9/shared';

/** 画布图（flow-runner 传入 React Flow 节点/边的最小只读形状） */
export interface ExecutorGraphNode {
  id: string;
  type?: string | null;
  data?: Record<string, unknown>;
}

export interface ExecutorGraphEdge {
  source: string;
  target: string;
}

export interface BlockExecutorContext {
  block: FlowBlock;
  prompt: string;
  upstream: {
    prompts?: string[];
    pictures: string[];
    clips: string[];
    sounds?: string[];
    promptBatch?: PromptBatchJob[];
    promptDispatch?: PromptDispatchMeta;
  };
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  /** 画布图引用（F-003 链镜表 / F-017 强约束 / F-032 参考板约束需要） */
  nodes?: ExecutorGraphNode[];
  edges?: ExecutorGraphEdge[];
  /** PG-04: 取消信号 — 透传给生成请求与轮询 */
  abortSignal?: AbortSignal;
}

export interface BlockExecutor {
  kind: string;
  execute(ctx: BlockExecutorContext): Promise<void>;
}
