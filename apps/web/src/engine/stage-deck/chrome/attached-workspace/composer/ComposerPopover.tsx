import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface ComposerPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  align?: 'start' | 'end';
  placement?: 'above' | 'below';
  width?: number;
  /** 炭黑工作台弹层（对齐剧本拆分） */
  tone?: 'default' | 'desk';
}

export function ComposerPopover({
  open,
  onClose,
  anchorRef,
  children,
  align = 'start',
  placement = 'below',
  width = 200,
  tone = 'default',
}: ComposerPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? 220;
      const panelW = width;
      let left = align === 'end' ? rect.right - panelW : rect.left;
      left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - panelW - 8));
      let top = placement === 'above' ? rect.top - panelH - 6 : rect.bottom + 6;
      if (top + panelH > window.innerHeight - 8) {
        top = Math.max(8, rect.top - panelH - 6);
      }
      if (top < 8) top = Math.min(rect.bottom + 6, window.innerHeight - panelH - 8);
      setPos({ top: Math.max(8, top), left });
    };
    update();
    requestAnimationFrame(update);
  }, [open, anchorRef, align, placement, width, children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[320] cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`nx9-composer-popover fixed z-[321] rounded-xl border border-line/60 bg-white shadow-panel py-1 nodrag nopan ${
          tone === 'desk' ? 'is-picture-desk' : ''
        }`}
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? 0,
          width,
          visibility: pos ? 'visible' : 'hidden',
          maxHeight: 'min(320px, calc(100vh - 24px))',
          overflowY: 'auto',
        }}
        onMouseDown={stop}
        onPointerDown={stop}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export function PopoverItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
        active ? 'bg-brand/8 text-brand font-medium' : 'text-ink/75 hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}
