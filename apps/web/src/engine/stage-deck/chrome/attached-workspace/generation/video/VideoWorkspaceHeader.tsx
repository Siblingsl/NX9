import { useRef, useState } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';
import { CLIP_GEN_MODELS, lookupBlock } from '@nx9/shared';
import type { NodeRunStatus } from '@nx9/shared';
import { VideoPopover, PopoverItem } from './VideoPopover';

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

export interface VideoWorkspaceHeaderProps {
  kind: string;
  status?: NodeRunStatus;
  model: string;
  onModelChange: (model: string) => void;
  onCollapse?: () => void;
}

export function VideoWorkspaceHeader({
  kind,
  status,
  model,
  onModelChange,
  onCollapse,
}: VideoWorkspaceHeaderProps) {
  const meta = lookupBlock(kind);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const modelLabel = CLIP_GEN_MODELS.find((m) => m.id === model)?.label ?? model;

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

      <button
        ref={modelBtnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setModelOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] text-ink/60 hover:text-ink hover:bg-surface/80 transition-colors"
      >
        {modelLabel}
        <ChevronDown size={11} className="text-ink/30" />
      </button>

      <VideoPopover
        open={modelOpen}
        onClose={() => setModelOpen(false)}
        anchorRef={modelBtnRef}
        align="end"
        width={168}
      >
        {CLIP_GEN_MODELS.map((m) => (
          <PopoverItem
            key={m.id}
            active={m.id === model}
            onClick={() => {
              onModelChange(m.id);
              setModelOpen(false);
            }}
          >
            {m.label}
          </PopoverItem>
        ))}
      </VideoPopover>

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
