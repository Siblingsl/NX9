import { memo, useCallback, useRef } from 'react';
import { useStore } from '@xyflow/react';
import {
  isDirector3dDelegatedToPreview,
  isPictureGenDelegatedToPreview,
  resolveNodeInteraction,
} from '@nx9/shared';
import { useDeckUi } from '../stores/deck-ui';
import { NodeAttachedPromptBar } from './NodeAttachedPromptBar';
import { isSurfaceEnabled } from '../../../config/product-surface';

export interface NodePromptBarAnchorProps {
  blockId: string;
  kind: string;
  selected?: boolean;
}

const PANEL_WIDTH = 480;
const PANEL_WIDTH_BY_KIND: Record<string, number> = {
  'picture-gen': 560,
  'clip-gen': 520,
};
const ZERO_OFFSET = { x: 0, y: 0 };

/**
 * 底部/节点跟随工作区锚点 — 挂在节点下方，随节点移动。
 * 分镜预览、视频生成等 Attached Workspace 走这里，不要改成屏幕弹窗。
 */
export const NodePromptBarAnchor = memo(function NodePromptBarAnchor({
  blockId,
  kind,
  selected,
}: NodePromptBarAnchorProps) {
  const selectedBlockId = useDeckUi((s) => s.selectedBlockId);
  const promptBarVisible = useDeckUi((s) => s.promptBarVisible);
  const promptBarOffsets = useDeckUi((s) => s.promptBarOffsets);
  const offset = promptBarOffsets[blockId] ?? ZERO_OFFSET;
  const setPromptBarOffset = useDeckUi((s) => s.setPromptBarOffset);
  const zoom = useStore((s) => s.transform[2]) || 1;
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const delegatedToPreview =
    (kind === 'picture-gen' && isPictureGenDelegatedToPreview(blockId, nodes, edges)) ||
    (kind === 'director-3d' && isDirector3dDelegatedToPreview(blockId, nodes, edges));
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  );

  const interaction = resolveNodeInteraction(kind);
  const show =
    isSurfaceEnabled('promptBar') &&
    Boolean(selected) &&
    selectedBlockId === blockId &&
    promptBarVisible &&
    interaction.opensPromptBar &&
    !delegatedToPreview;

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.nx9-prompt-bar-drag-handle')) return;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset.x, offset.y],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      e.stopPropagation();
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;
      setPromptBarOffset(blockId, {
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    },
    [blockId, setPromptBarOffset, zoom],
  );

  const onDragPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  if (!show) return null;

  const panelWidth = PANEL_WIDTH_BY_KIND[kind] ?? PANEL_WIDTH;

  return (
    <div
      className="absolute z-[70] nodrag nopan nowheel pointer-events-auto"
      style={{
        left: '50%',
        top: '100%',
        width: panelWidth,
        paddingTop: 12,
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
      }}
      onPointerDown={onDragPointerDown}
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerUp}
      onPointerCancel={onDragPointerUp}
    >
      <NodeAttachedPromptBar blockId={blockId} kind={kind} />
    </div>
  );
});
