import { useCallback } from 'react';
import { lookupBlock } from '@nx9/shared';
import { useDeckUi } from '../../../stores/deck-ui';
import { useReactFlow } from '@xyflow/react';

export interface ControlWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function ControlWorkspace({ blockId, kind, onCollapse }: ControlWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const { getNode } = useReactFlow();
  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const meta = lookupBlock(kind);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const status = (data.status as string) ?? 'idle';

  return (
    <div
      className="flex flex-col px-3 py-1.5 max-h-[120px]"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 nodrag">
        {meta?.glyph && <span className="text-ink/40 text-xs">{meta.glyph}</span>}
        <span className="text-xs font-medium text-ink/70">{meta?.label ?? kind}</span>
        {status && (
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'running' ? 'bg-brand animate-pulse' :
            status === 'success' ? 'bg-ok' :
            status === 'error' ? 'bg-warn' : 'bg-ink/20'
          }`} />
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-ink/40">{kind}</span>
        <button
          type="button"
          onClick={handleCollapse}
          className="p-0.5 rounded text-ink/30 hover:text-ink hover:bg-ink/5"
          title="收起"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
      </div>
      <div className="text-[10px] text-ink/40 mt-1">
        {meta?.hint ?? ''}
      </div>
    </div>
  );
}
