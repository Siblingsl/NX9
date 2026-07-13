import type { StoryboardPreviewFrame, StoryboardPreviewGridColumns } from '@nx9/shared';
import { StoryboardPreviewFrameCard } from './StoryboardPreviewFrameCard';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const COL_CLASS: Record<StoryboardPreviewGridColumns, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export interface StoryboardPreviewGridProps {
  frames: StoryboardPreviewFrame[];
  columns: StoryboardPreviewGridColumns;
  selectedFrameId?: string | null;
  onSelect: (frameId: string) => void;
  onToggleLock: (frameId: string) => void;
  onRegenerate: (frameId: string) => void;
  onInsertAfter: (frameId: string) => void;
  onRemove: (frameId: string) => void;
}

export function StoryboardPreviewGrid({
  frames,
  columns,
  selectedFrameId,
  onSelect,
  onToggleLock,
  onRegenerate,
  onInsertAfter,
  onRemove,
}: StoryboardPreviewGridProps) {
  const sorted = [...frames].sort((a, b) => a.order - b.order);

  return (
    <div
      className={`grid ${COL_CLASS[columns]} gap-2 px-3 pb-2 nodrag nopan`}
      onMouseDown={stop}
    >
      {sorted.map((frame) => (
        <StoryboardPreviewFrameCard
          key={frame.id}
          frame={frame}
          selected={selectedFrameId === frame.id}
          onSelect={() => onSelect(frame.id)}
          onToggleLock={() => onToggleLock(frame.id)}
          onRegenerate={() => onRegenerate(frame.id)}
          onInsertAfter={() => onInsertAfter(frame.id)}
          onRemove={() => onRemove(frame.id)}
        />
      ))}
    </div>
  );
}
