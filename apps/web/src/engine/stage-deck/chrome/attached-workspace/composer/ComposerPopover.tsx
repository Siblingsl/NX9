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
      const left = align === 'end' ? rect.right - width : rect.left;
      const panelH = panelRef.current?.offsetHeight ?? 0;
      const top = placement === 'above' ? rect.top - panelH - 6 : rect.bottom + 6;
      setPos({ top: Math.max(8, top), left: Math.max(8, left) });
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
        className="fixed inset-0 z-[120] cursor-default"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`nx9-composer-popover fixed z-[121] rounded-xl border border-line/60 bg-white shadow-panel py-1 nodrag nopan ${
          tone === 'desk' ? 'is-picture-desk' : ''
        }`}
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? 0,
          width,
          visibility: pos ? 'visible' : 'hidden',
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
