import { useCallback, useEffect } from 'react';
import { useDeckUi } from '../stores/deck-ui';
import { AttachedWorkspaceRouter } from './attached-workspace/AttachedWorkspaceRouter';

export interface NodeAttachedPromptBarProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/** Prompt Bar 壳层 — 挂载在节点下方，随节点移动；内部内容由 AttachedWorkspaceRouter 路由 */
export function NodeAttachedPromptBar({ blockId, kind, onCollapse }: NodeAttachedPromptBarProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const visible = useDeckUi((s) => s.promptBarVisible);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCollapse();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, handleCollapse]);

  return (
    <div
      className="nx9-attached-prompt-bar rounded-2xl border border-line dark:border-[#333] bg-white/95 dark:bg-[#222222]/95 backdrop-blur-md shadow-panel nx9-deck-enter"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <AttachedWorkspaceRouter blockId={blockId} kind={kind} onCollapse={handleCollapse} />
    </div>
  );
}
