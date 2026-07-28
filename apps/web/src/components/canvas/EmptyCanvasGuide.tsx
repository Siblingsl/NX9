/**
 * EmptyCanvasGuide — 首次进入画布引导（F-041）。
 *
 * 空图时展示三 CTA：选 Playbook / 应用核心模板 / 打开命令面板。
 * 一次性 localStorage 标记，非空不显示。
 */
import { memo, useEffect, useState } from 'react';
import { Sparkles, LayoutGrid, Command } from 'lucide-react';

const STORAGE_KEY = 'nx9.canvas.onboarded';

function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* noop */
  }
}

export const EmptyCanvasGuide = memo(function EmptyCanvasGuide({
  nodeCount,
  onPickPlaybook,
  onOpenCommandPalette,
  onLoadTemplate,
}: {
  nodeCount: number;
  onPickPlaybook: () => void;
  onOpenCommandPalette: () => void;
  onLoadTemplate: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (nodeCount === 0 && !hasOnboarded()) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [nodeCount]);

  if (!visible) return null;

  const handleDismiss = () => {
    markOnboarded();
    setVisible(false);
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-sm w-full mx-4">
        <div className="rounded-2xl border border-brand/20 bg-surface/95 backdrop-blur-sm shadow-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-ink tracking-tight">欢迎使用画布</h3>
          <p className="text-[11px] text-ink/55 leading-relaxed">
            从空白开始，或选择以下方式快速启动：
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { handleDismiss(); onPickPlaybook(); }}
              className="w-full flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-left hover:bg-brand/10 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                <Sparkles size={16} />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-ink">选择 Playbook 引导</p>
                <p className="text-[9px] text-ink/40">按步骤完成剧本→分镜→视频→导出</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { handleDismiss(); onLoadTemplate(); }}
              className="w-full flex items-center gap-3 rounded-xl border border-line/50 bg-surface p-3 text-left hover:border-brand/20 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                <LayoutGrid size={16} />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-ink">应用核心模板</p>
                <p className="text-[9px] text-ink/40">一键搭建完整工作流</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { handleDismiss(); onOpenCommandPalette(); }}
              className="w-full flex items-center gap-3 rounded-xl border border-line/50 bg-surface p-3 text-left hover:border-brand/20 transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-surface text-ink/60 flex items-center justify-center">
                <Command size={16} />
              </span>
              <div>
                <p className="text-[12px] font-semibold text-ink">打开命令面板</p>
                <p className="text-[9px] text-ink/40">快速添加节点、模板和设置</p>
              </div>
            </button>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full text-center text-[10px] text-ink/40 hover:text-ink/60 underline underline-offset-2"
          >
            暂时不需要，开始空白画布
          </button>
        </div>
      </div>
    </div>
  );
});
