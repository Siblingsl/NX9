import { Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { StoryboardPreviewFrame } from '@nx9/shared';
import { canRegenerateFrame } from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  generating: 'Generating',
  success: 'Success',
  error: 'Error',
  modified: 'Modified',
  locked: 'Locked',
};

const STATUS_CLASS: Record<string, string> = {
  idle: 'bg-ink/15 text-ink/45',
  generating: 'bg-brand/15 text-brand animate-pulse',
  success: 'bg-ok/15 text-ok',
  error: 'bg-warn/15 text-warn',
  modified: 'bg-amber-500/15 text-amber-700',
  locked: 'bg-violet-500/15 text-violet-700',
};

export interface StoryboardPreviewFrameCardProps {
  frame: StoryboardPreviewFrame;
  selected?: boolean;
  checked?: boolean;
  onSelect: () => void;
  onToggleSelect?: () => void;
  onToggleLock: () => void;
  onRegenerate: () => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}

export function StoryboardPreviewFrameCard({
  frame,
  selected,
  checked,
  onSelect,
  onToggleSelect,
  onToggleLock,
  onRegenerate,
  onInsertAfter,
  onRemove,
}: StoryboardPreviewFrameCardProps) {
  const canRegen = canRegenerateFrame(frame);

  return (
    <div
      className={`group relative flex flex-col rounded-xl border bg-white overflow-hidden nodrag nopan transition-shadow ${
        selected ? 'border-brand/50 ring-2 ring-brand/20' : checked ? 'border-brand/30' : 'border-line/45 hover:border-line/70'
      } ${frame.locked ? 'opacity-95' : ''}`}
      onMouseDown={stop}
      onClick={onSelect}
    >
      {onToggleSelect && (
        <button
          type="button"
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute top-1.5 left-1.5 z-10 w-4 h-4 rounded border text-[9px] grid place-items-center ${
            checked ? 'bg-brand border-brand text-white' : 'bg-white/90 border-line/60 text-transparent'
          }`}
        >
          ✓
        </button>
      )}
      <div className="relative aspect-video bg-surface/60">
        {frame.imageUrl ? (
          <img src={frame.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">
            待生成
          </div>
        )}
        <button
          type="button"
          title={frame.locked ? '已锁定 · 不会参与重新生成' : '锁定分镜'}
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className={`absolute top-1.5 right-1.5 p-1 rounded-md backdrop-blur-sm ${
            frame.locked
              ? 'bg-violet-600/90 text-white'
              : 'bg-black/35 text-white/90 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Lock size={12} />
        </button>
      </div>

      <div className="px-2 py-1.5 space-y-0.5 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-ink truncate">{frame.label}</span>
          <span className="text-[9px] text-ink/40 shrink-0">
            {frame.startSec.toFixed(0)}~{frame.endSec.toFixed(0)}s
          </span>
          <span
            className={`ml-auto shrink-0 px-1 py-0.5 rounded text-[8px] ${STATUS_CLASS[frame.status] ?? STATUS_CLASS.idle}`}
          >
            {STATUS_LABEL[frame.status] ?? frame.status}
          </span>
        </div>
        {frame.sceneCode && (
          <p className="text-[9px] text-ink/40 truncate">场景 {frame.sceneCode}</p>
        )}
        {frame.director3dGuide && (
          <p className="text-[9px] text-violet-700 truncate">3D 机位已绑定</p>
        )}
        <p className="text-[9px] text-ink/55 line-clamp-2 leading-snug">{frame.promptSummary || '—'}</p>
      </div>

      <div className="flex items-center gap-0.5 px-1.5 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          disabled={!canRegen}
          title={frame.locked ? '已锁定' : '重新生成此张'}
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
          className="p-1 rounded text-ink/40 hover:text-brand disabled:opacity-30"
        >
          <RefreshCw size={11} />
        </button>
        <button
          type="button"
          title="插入分镜"
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onInsertAfter();
          }}
          className="p-1 rounded text-ink/40 hover:text-brand"
        >
          <Plus size={11} />
        </button>
        <button
          type="button"
          disabled={frame.locked}
          title="删除"
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 rounded text-ink/40 hover:text-warn disabled:opacity-30 ml-auto"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
