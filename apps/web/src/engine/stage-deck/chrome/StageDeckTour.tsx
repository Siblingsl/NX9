import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'nx9-stage-deck-tour-v2';

const STEPS = [
  {
    title: '欢迎使用 Stage Deck',
    body: '新画布将模块参数收到底部 Composer Deck，左侧改为图标 Dock，右侧为 Context Rail。',
  },
  {
    title: '三种模式',
    body: '顶栏可切换 探索 / 生产 / 审片。生产模式卡片折叠；审片模式显示 Take 胶片条。',
  },
  {
    title: 'Composer Deck',
    body: '选中可运行模块后，底部滑出操作台：Prompt、模板、运行与 Cascade。',
  },
  {
    title: 'Context Rail',
    body: '右侧栏集中属性、分镜、Backlot、历史、工作流导出与 Agent 确认。',
  },
  {
    title: 'Playbook 引导',
    body: '选择生产剧本后，顶栏出现步骤条引导您逐步完成。右侧 Banner 显示「执行下一步」快捷操作。',
  },
];

export function StageDeckTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') return;
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, []);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step >= STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center pb-24 px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full rounded-2xl border border-line bg-white shadow-panel p-5 nx9-tour-enter">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] text-brand font-semibold uppercase tracking-wide">
              引导 {step + 1}/{STEPS.length}
            </p>
            <h3 className="text-base font-semibold text-ink mt-0.5">{current.title}</h3>
          </div>
          <button type="button" onClick={finish} className="p-1 rounded-lg hover:bg-surface text-ink/40">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-ink/70 leading-relaxed">{current.body}</p>
        <div className="flex items-center justify-between mt-4 gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-ink/50 hover:text-ink"
          >
            跳过
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="text-xs px-3 py-1.5 rounded-lg border border-line"
              >
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white"
            >
              {isLast ? '开始使用' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
