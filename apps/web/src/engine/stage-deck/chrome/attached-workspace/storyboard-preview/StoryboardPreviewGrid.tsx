import type {
  StoryboardGuideKind,
  StoryboardPreviewFrame,
  StoryboardPreviewGridColumns,
  StoryboardShot,
} from '@nx9/shared';
import { StoryboardPreviewFrameCard } from './StoryboardPreviewFrameCard';
import '../../../../../styles/storyboard-board.css';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardPreviewGridProps {
  frames: StoryboardPreviewFrame[];
  columns: StoryboardPreviewGridColumns;
  /** shotId → 镜头，用于标题/运镜/对白等专业故事板标注 */
  shotById?: Map<string, StoryboardShot>;
  selectedFrameId?: string | null;
  selectedIds?: Set<string>;
  showGuide?: boolean;
  guideKinds?: readonly StoryboardGuideKind[] | null;
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
  shotById,
  selectedFrameId,
  selectedIds,
  showGuide = true,
  guideKinds = null,
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
      className={`sb-board sb-board-grid is-cols-${columns} nodrag nopan`}
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
            shot={shotById?.get(frame.sourceShotId) ?? null}
            selected={selectedFrameId === frame.id}
            checked={selectedIds?.has(frame.id)}
            showGuide={showGuide}
            guideKinds={guideKinds}
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
