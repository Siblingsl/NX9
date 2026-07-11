import { useCallback } from 'react';
import { lookupBlock } from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useDeckUi } from '../../../stores/deck-ui';
import { useAttachedNodeData } from '../generation/use-attached-node-data';

export interface ControlWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ControlWorkspace({ blockId, kind, onCollapse }: ControlWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);
  const meta = lookupBlock(kind);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const status = (data.status as string) ?? 'idle';
  const hint = meta?.hint ?? '';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      showToolbar={false}
      heightClass="h-[120px] max-h-[140px]"
      bodyClassName="flex-1 min-h-0 px-3 py-1 text-[10px] text-ink/40"
    >
      {hint || '控制节点'}
    </ComposerWorkspaceShell>
  );
}
