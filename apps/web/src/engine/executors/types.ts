import type { FlowBlock, PromptBatchJob, PromptDispatchMeta } from '@nx9/shared';

export interface BlockExecutorContext {
  block: FlowBlock;
  prompt: string;
  upstream: {
    pictures: string[];
    clips: string[];
    audio: string[];
    promptBatch?: PromptBatchJob[];
    promptDispatch?: PromptDispatchMeta;
  };
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
}

export interface BlockExecutor {
  kind: string;
  execute(ctx: BlockExecutorContext): Promise<void>;
}
