import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { PromptBatchPanel } from '../../engine/stage-deck/chrome/attached-workspace/prompt/PromptBatchPanel';
import { usePromptBatchNodeAdapter, usePromptBatchState } from '../shared/usePromptBatchState';

function PromptBlock(props: NodeProps) {
  const { data, updateNode } = usePromptBatchNodeAdapter(props.id);
  const batch = usePromptBatchState({ blockId: props.id, data, updateNode });

  if (!batch.useBatchWorkspace) {
    return (
      <BlockShell {...props} hideSockets={props.data?.hideSockets as boolean | undefined}>
        <p className="text-[11px] text-ink/45 italic nodrag nopan">
          选中节点，在下方工作区编辑 Prompt
        </p>
      </BlockShell>
    );
  }

  return (
    <BlockShell {...props} hideSockets={props.data?.hideSockets as boolean | undefined}>
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
        onPersist={batch.persistState}
        onUpdateItem={batch.updateItem}
        onAddItem={batch.addItem}
        onRemoveItem={batch.removeItem}
        onManualSync={batch.handleManualSync}
      />
    </BlockShell>
  );
}

export default memo(PromptBlock);
