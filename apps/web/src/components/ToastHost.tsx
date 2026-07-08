import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useToast, type ToastItem } from '../stores/toast';

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    if (item.variant === 'error' && item.actionLabel) return;
    const t = setTimeout(onDismiss, item.variant === 'success' ? 2800 : 4500);
    return () => clearTimeout(t);
  }, [item, onDismiss]);

  const icon =
    item.variant === 'error' ? (
      <AlertCircle size={16} className="text-warn shrink-0" />
    ) : item.variant === 'success' ? (
      <CheckCircle2 size={16} className="text-ok shrink-0" />
    ) : null;

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border shadow-panel px-3 py-2.5 min-w-[240px] max-w-sm ${
        item.variant === 'error'
          ? 'border-warn/30 bg-white'
          : item.variant === 'success'
            ? 'border-ok/30 bg-white'
            : 'border-line bg-white'
      }`}
      role="status"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink leading-snug">{item.message}</p>
        {item.actionLabel && item.onAction && (
          <button
            type="button"
            className="mt-1.5 text-xs font-medium text-brand hover:underline"
            onClick={() => {
              item.onAction?.();
            }}
          >
            {item.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        className="p-0.5 rounded hover:bg-surface text-ink/40 shrink-0"
        onClick={onDismiss}
        aria-label="关闭"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export const ToastHost = memo(function ToastHost() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);

  if (items.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[85] flex flex-col gap-2 items-center pointer-events-auto">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
      ))}
    </div>,
    document.body,
  );
});
