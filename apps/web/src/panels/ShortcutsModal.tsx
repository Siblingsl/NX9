import { memo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SHORTCUTS = [
  { keys: 'Ctrl+Z / Ctrl+Y', action: '撤销 / 重做' },
  { keys: 'Ctrl+C / Ctrl+V / Ctrl+D', action: '复制 / 粘贴 / 快速复制' },
  { keys: 'Ctrl+A', action: '全选模块' },
  { keys: 'Ctrl+点击', action: '追加 / 取消选中模块' },
  { keys: 'Ctrl+左键拖拽空白', action: '滑动框选多个模块' },
  { keys: 'Delete', action: '删除选中模块' },
  { keys: 'B', action: '开关故事板面板' },
  { keys: '?', action: '快捷键帮助' },
  { keys: '顶栏书本图标', action: '提示词模板库' },
  { keys: '右键空白', action: '快速添加模块 / 粘贴 / 整理' },
  { keys: '右键模块', action: '运行 / 对齐 / 复制 / 删除' },
  { keys: '双击模块', action: '聚焦模块' },
  { keys: '双击文本/图片', action: '内联编辑 / 图像编辑' },
];

export const ShortcutsModal = memo(function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white shadow-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold">快捷键</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface">
            <X size={16} />
          </button>
        </div>
        <ul className="p-4 space-y-2 max-h-[60vh] overflow-y-auto nx9-scroll">
          {SHORTCUTS.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 text-sm">
              <kbd className="text-xs font-mono px-2 py-1 rounded-lg bg-surface border border-line shrink-0">
                {row.keys}
              </kbd>
              <span className="text-ink/70 text-right">{row.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
});
