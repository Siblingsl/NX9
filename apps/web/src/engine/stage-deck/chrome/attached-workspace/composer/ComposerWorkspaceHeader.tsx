import { ChevronDown, GripVertical } from 'lucide-react';
import { lookupBlock } from '@nx9/shared';
import type { NodeRunStatus } from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
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

export interface ComposerWorkspaceHeaderProps {
  kind: string;
  status?: NodeRunStatus;
  onCollapse?: () => void;
  /** 右侧扩展区（如模型选择） */
  trailing?: React.ReactNode;
}

export function ComposerWorkspaceHeader({
  kind,
  status,
  onCollapse,
  trailing,
}: ComposerWorkspaceHeaderProps) {
  const meta = lookupBlock(kind);

  return (
    <div className="flex items-center gap-2 shrink-0 h-8 nodrag" onMouseDown={stop}>
      <GripVertical
        size={13}
        className="text-ink/20 shrink-0 nx9-prompt-bar-drag-handle cursor-grab active:cursor-grabbing"
      />
      {status && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? 'bg-ink/20'}`} />
      )}
      <p className="flex-1 min-w-0 text-[13px] font-medium text-ink truncate">
        {meta?.label ?? kind}
      </p>
      {trailing}
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="p-1 rounded-lg text-ink/35 hover:text-ink hover:bg-ink/5"
          title="收起"
        >
          <ChevronDown size={15} />
        </button>
      )}
    </div>
  );
}
