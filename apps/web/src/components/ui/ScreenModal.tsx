import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './screen-modal.css';
import '../../styles/stage-bible.css';

export interface ScreenModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** 面板最大宽度，默认 520 */
  width?: number | string;
  showChrome?: boolean;
  label?: string;
  /** stage：全屏画布深色弹窗 */
  variant?: 'default' | 'stage';
  className?: string;
  /** 标题栏右侧扩展（加法扩展，不影响其它节点） */
  headerRight?: React.ReactNode;
}

/**
 * 屏幕级弹窗 — 节点旁侧小浮层用；不用于底部 Attached Workspace。
 */
export function ScreenModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 520,
  showChrome = true,
  label,
  variant = 'stage',
  className = '',
  headerRight,
}: ScreenModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const panel = (
    <div
      className="nx9-screen-modal"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title ?? '对话框'}
    >
      <button
        type="button"
        className="nx9-screen-modal__backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className={`nx9-screen-modal__panel nodrag nopan nowheel ${
          variant === 'stage' ? 'sb-modal' : ''
        } ${className}`.trim()}
        style={{ width: typeof width === 'number' ? `min(${width}px, calc(100vw - 32px))` : width }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {showChrome && (title || subtitle) && (
          <header className="nx9-screen-modal__chrome">
            <div className="min-w-0 flex-1">
              {title && <h2 className="nx9-screen-modal__title">{title}</h2>}
              {subtitle && <p className="nx9-screen-modal__sub">{subtitle}</p>}
            </div>
            {headerRight ? <div className="nx9-screen-modal__header-right shrink-0">{headerRight}</div> : null}
            <button
              type="button"
              className="nx9-screen-modal__close"
              onClick={onClose}
              title="关闭 (Esc)"
            >
              <X size={16} />
            </button>
          </header>
        )}
        {!showChrome && (
          <button
            type="button"
            className="nx9-screen-modal__close nx9-screen-modal__close--float"
            onClick={onClose}
            title="关闭 (Esc)"
          >
            <X size={16} />
          </button>
        )}
        <div className={`nx9-screen-modal__body ${variant === 'stage' ? 'sb' : ''}`.trim()}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
