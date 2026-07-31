import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from '../stores/confirm-dialog';
import './confirm-host.css';

export const ConfirmHost = memo(function ConfirmHost() {
  const pending = useConfirmDialog((s) => s.pending);
  const resolve = useConfirmDialog((s) => s.resolve);
  const setOptionChecked = useConfirmDialog((s) => s.setOptionChecked);

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
      className="nx9-confirm"
      role="presentation"
      onClick={() => resolve(false)}
    >
      <div
        className="nx9-confirm__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nx9-confirm-title"
        aria-describedby={pending.description ? 'nx9-confirm-desc' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="nx9-confirm-title" className="nx9-confirm__title">
          {pending.title}
        </p>
        {pending.description ? (
          <p id="nx9-confirm-desc" className="nx9-confirm__desc">
            {pending.description}
          </p>
        ) : null}
        {pending.option && (
          <label className="nx9-confirm__option">
            <input
              type="checkbox"
              checked={pending.optionChecked}
              onChange={(e) => setOptionChecked(e.target.checked)}
            />
            <span>{pending.option.label}</span>
          </label>
        )}
        {!pending.description && !pending.option ? <div style={{ height: 12 }} /> : null}
        <div className="nx9-confirm__acts">
          <button
            type="button"
            onClick={() => resolve(false)}
            className="nx9-confirm__btn nx9-confirm__btn--ghost"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => resolve(true)}
            className={`nx9-confirm__btn ${isDanger ? 'nx9-confirm__btn--danger' : 'nx9-confirm__btn--primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
