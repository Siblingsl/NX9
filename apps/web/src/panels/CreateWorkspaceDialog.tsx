import { useEffect, useState } from 'react';
import { Clapperboard, FolderLock, X } from 'lucide-react';
import './create-workspace-dialog.css';

export interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (title: string, opts?: { bootstrapCorePipeline?: boolean }) => Promise<void>;
  submitting?: boolean;
  defaultTitle?: string;
  /** 默认勾选「载入核心制作流程」 */
  defaultBootstrapCore?: boolean;
}

export function CreateWorkspaceDialog({
  open,
  onClose,
  onConfirm,
  submitting = false,
  defaultTitle,
  defaultBootstrapCore = true,
}: CreateWorkspaceDialogProps) {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [bootstrapCore, setBootstrapCore] = useState(defaultBootstrapCore);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle ?? `私有项目 ${new Date().toLocaleDateString('zh-CN')}`);
    setBootstrapCore(defaultBootstrapCore);
  }, [open, defaultTitle, defaultBootstrapCore]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    const name = title.trim();
    if (!name) return;
    await onConfirm(name, { bootstrapCorePipeline: bootstrapCore });
  };

  return (
    <div className="nx9-create-project fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="nx9-create-project__backdrop absolute inset-0"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="nx9-create-project__panel relative w-full max-w-md overflow-hidden"
      >
        <div className="nx9-create-project__header flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="font-semibold text-base">新建一部剧</h2>
            <p className="text-[11px] opacity-55 mt-0.5">从核心制作流程开始，或创建空白画布</p>
          </div>
          <button type="button" onClick={onClose} className="nx9-create-project__close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="nx9-create-project__notice flex items-start gap-3 rounded-xl p-4">
            <FolderLock size={20} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              创建制作项目。推荐载入核心流程：编剧台 → 分镜 → 出图批审 → 视频 → 导出。
            </p>
          </div>

          <label className="block">
            <span className="nx9-create-project__label text-xs mb-1 block">项目名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：短剧第一季"
              className="nx9-create-project__input w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </label>

          <label className="nx9-create-project__option flex items-start gap-3 rounded-xl p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={bootstrapCore}
              onChange={(e) => setBootstrapCore(e.target.checked)}
              className="mt-0.5 accent-[var(--nx9-brand)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Clapperboard size={14} />
                载入核心制作流程
              </span>
              <span className="block text-[11px] mt-0.5 leading-relaxed opacity-60">
                自动放置编剧台、分镜台、出图、批审、视频与导出节点，并可从画布「编剧台」粘贴成稿。
              </span>
            </span>
          </label>
        </div>

        <div className="nx9-create-project__footer flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="nx9-create-project__ghost px-4 py-2 rounded-xl text-sm"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !title.trim()}
            onClick={() => void handleSubmit()}
            className="nx9-create-project__primary px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '创建中…' : bootstrapCore ? '创建并开始制作' : '创建空白项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
