import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';

interface StudioDropdownPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  className?: string;
}

export function StudioDropdownPanel({
  anchorRef,
  open,
  onClose,
  width = 208,
  children,
  className = '',
}: StudioDropdownPanelProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, width]);

  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[190] cursor-default"
        aria-label="关闭菜单"
        onClick={onClose}
      />
      <div
        className={`fixed z-[200] rounded-xl border border-line bg-white shadow-[0_12px_40px_rgba(34,34,34,0.14)] ${className}`}
        style={{ top: pos.top, left: pos.left, width }}
        role="menu"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
