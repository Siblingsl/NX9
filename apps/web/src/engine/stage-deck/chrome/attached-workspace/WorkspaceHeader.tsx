import { ChevronDown, GripVertical } from 'lucide-react';
import { lookupBlock } from '@nx9/shared';
import type { NodeRunStatus } from '@nx9/shared';

export interface WorkspaceHeaderProps {
  kind: string;
  status?: NodeRunStatus;
  onCollapse?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-ink/20',
  ready: 'bg-brand/60',
  running: 'bg-brand animate-pulse',
  success: 'bg-ok',
  error: 'bg-warn',
  waiting: 'bg-warn/70',
  disabled: 'bg-ink/15',
};

export function WorkspaceHeader({ kind, status, onCollapse }: WorkspaceHeaderProps) {
  const meta = lookupBlock(kind);
  return (
    <div className="flex items-center gap-2 shrink-0 mb-2 nodrag">
      <GripVertical
        size={14}
        className="text-ink/25 shrink-0 nx9-prompt-bar-drag-handle cursor-grab active:cursor-grabbing"
      />
      {status && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? 'bg-ink/20'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{meta?.label ?? kind}</p>
        <p className="text-[10px] text-ink/40">Workspace</p>
      </div>
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="p-1 rounded-lg text-ink/40 hover:text-ink hover:bg-ink/5"
          title="收起"
        >
          <ChevronDown size={16} />
        </button>
      )}
    </div>
  );
}
