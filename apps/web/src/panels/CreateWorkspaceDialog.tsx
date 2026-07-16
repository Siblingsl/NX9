import { useEffect, useState } from 'react';
import { Clapperboard, FolderLock, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md bg-[#FFFCFA] rounded-2xl shadow-2xl border border-line overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-base text-ink">新建一部剧</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface text-ink/50">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-line p-4 bg-surface/40">
            <FolderLock size={20} className="text-brand shrink-0 mt-0.5" />
            <p className="text-xs text-ink/55 leading-relaxed">
              创建制作项目。推荐载入核心流程：剧本拆分 → 分镜 → 出图批审 → 视频 → 导出。
            </p>
          </div>

          <label className="block">
            <span className="text-xs text-ink/50 mb-1 block">项目名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：短剧第一季"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:border-brand/40 bg-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand/[0.04] p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={bootstrapCore}
              onChange={(e) => setBootstrapCore(e.target.checked)}
              className="mt-0.5 accent-[var(--nx9-brand)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <Clapperboard size={14} className="text-brand" />
                载入核心制作流程
              </span>
              <span className="block text-[11px] text-ink/50 mt-0.5 leading-relaxed">
                自动放置剧本拆分、分镜网格、出图、批审、视频与导出节点，并可在右侧「编剧」开始粘贴剧本。
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line bg-surface/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-ink/60 hover:bg-surface"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || !title.trim()}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '创建中…' : bootstrapCore ? '创建并开始制作' : '创建空白项目'}
          </button>
        </div>
      </div>
    </div>
  );
}
