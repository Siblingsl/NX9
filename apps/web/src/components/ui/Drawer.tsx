import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: 'left' | 'right';
}

export function Drawer({ open, onClose, title, children, side = 'right' }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose}>
      <div
        className={`absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} h-full w-[360px] bg-white shadow-xl border-l border-line flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
            <span className="font-semibold text-sm">{title}</span>
            <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/40">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto nx9-scroll p-4">{children}</div>
      </div>
    </div>
  );
}
