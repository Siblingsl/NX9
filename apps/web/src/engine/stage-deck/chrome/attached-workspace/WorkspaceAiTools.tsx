import { Sparkles, Wand2, FileSymlink, Languages } from 'lucide-react';

export interface WorkspaceAiToolsProps {
  onOptimize?: () => void;
  onComplete?: () => void;
  onRewrite?: () => void;
  onTranslate?: () => void;
}

export function WorkspaceAiTools({ onOptimize, onComplete, onRewrite, onTranslate }: WorkspaceAiToolsProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-ink/50 hover:bg-brand/5 hover:text-brand"
        title="Ctrl+/"
        onClick={onOptimize}
      >
        <Sparkles size={12} />
        优化
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-ink/50 hover:bg-brand/5 hover:text-brand"
        onClick={onComplete}
      >
        <Wand2 size={12} />
        补全
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-ink/50 hover:bg-brand/5 hover:text-brand"
        onClick={onRewrite}
      >
        <FileSymlink size={12} />
        重写
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-ink/50 hover:bg-brand/5 hover:text-brand"
        onClick={onTranslate}
      >
        <Languages size={12} />
        翻译
      </button>
    </div>
  );
}
