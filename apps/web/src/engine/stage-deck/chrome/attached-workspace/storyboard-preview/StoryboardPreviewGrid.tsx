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
  selectedIds?: Set<string>;
  onSelect: (frameId: string) => void;
  onToggleSelect?: (frameId: string) => void;
  onToggleLock: (frameId: string) => void;
  onRegenerate: (frameId: string) => void;
  onInsertAfter: (frameId: string) => void;
  onRemove: (frameId: string) => void;
  onReorder?: (frameId: string, targetIndex: number) => void;
}

export function StoryboardPreviewGrid({
  frames,
  columns,
  selectedFrameId,
  selectedIds,
  onSelect,
  onToggleSelect,
  onToggleLock,
  onRegenerate,
  onInsertAfter,
  onRemove,
  onReorder,
}: StoryboardPreviewGridProps) {
  const sorted = [...frames].sort((a, b) => a.order - b.order);

  return (
    <div
      className={`grid ${COL_CLASS[columns]} gap-2 px-3 pb-2 nodrag nopan`}
      onMouseDown={stop}
    >
      {sorted.map((frame, index) => (
        <div
          key={frame.id}
          draggable={Boolean(onReorder)}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/x-nx9-frame-id', frame.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!onReorder) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            if (!onReorder) return;
            e.preventDefault();
            const id = e.dataTransfer.getData('text/x-nx9-frame-id');
            if (id && id !== frame.id) onReorder(id, index);
          }}
        >
          <StoryboardPreviewFrameCard
            frame={frame}
            selected={selectedFrameId === frame.id}
            checked={selectedIds?.has(frame.id)}
            onSelect={() => onSelect(frame.id)}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(frame.id) : undefined}
            onToggleLock={() => onToggleLock(frame.id)}
            onRegenerate={() => onRegenerate(frame.id)}
            onInsertAfter={() => onInsertAfter(frame.id)}
            onRemove={() => onRemove(frame.id)}
          />
        </div>
      ))}
    </div>
  );
}
