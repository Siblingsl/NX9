import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from '../stores/confirm-dialog';

export const ConfirmHost = memo(function ConfirmHost() {
  const pending = useConfirmDialog((s) => s.pending);
  const resolve = useConfirmDialog((s) => s.resolve);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, resolve]);

  if (!pending) return null;

  const confirmLabel = pending.confirmLabel ?? '确认';
  const cancelLabel = pending.cancelLabel ?? '取消';
  const isDanger = (pending.tone ?? 'danger') === 'danger';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: 'rgba(26, 24, 20, 0.72)' }}
      role="presentation"
      onClick={() => resolve(false)}
    >
      <div
        className="w-[320px] rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nx9-confirm-title"
        aria-describedby={pending.description ? 'nx9-confirm-desc' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="nx9-confirm-title" className="text-[15px] font-semibold text-ink mb-1">
          {pending.title}
        </p>
        {pending.description && (
          <p id="nx9-confirm-desc" className="text-[12px] text-ink/55 mb-5 leading-relaxed">
            {pending.description}
          </p>
        )}
        {!pending.description && <div className="mb-5" />}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => resolve(false)}
            className="px-3.5 py-2 rounded-xl text-[12px] text-ink/60 hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => resolve(true)}
            className={
              isDanger
                ? 'px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-500'
                : 'px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white bg-brand hover:bg-brand/90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
