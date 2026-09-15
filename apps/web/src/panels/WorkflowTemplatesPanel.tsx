import { useState } from 'react';
import { listWorkflowTemplates } from '@nx9/shared';
import { LayoutTemplate, X } from 'lucide-react';
import { useFlowCommands } from '../stores/flow-commands';
import {
  filterTemplatesForFirstLane,
  isFirstLaneUnlocked,
  unlockFirstLane,
} from '../engine/first-lane';

export function WorkflowTemplatesPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const requestLoad = useFlowCommands((s) => s.requestLoadTemplate);
  const [unlocked, setUnlocked] = useState(() => isFirstLaneUnlocked());

  if (!open) return null;

  const categories = [
    { key: 'video', label: '视频' },
    { key: 'image', label: '图像' },
    { key: 'story', label: '分镜' },
    { key: 'tool', label: '工具' },
  ] as const;

  const listed = filterTemplatesForFirstLane(listWorkflowTemplates());

  return (
    <aside
      className="w-[320px] shrink-0 border-l border-line bg-surface flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel"
      data-testid="workflow-templates-panel"
      data-first-lane={unlocked ? 'off' : 'on'}
    >
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <LayoutTemplate size={18} className="text-brand" />
        <span className="font-semibold text-sm flex-1">工作流模板</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>
      {!unlocked && (
        <div className="px-3 py-2 border-b border-line bg-brand/5">
          <p className="text-[10px] text-ink/55 leading-relaxed">
            首用单车道：仅显示「AI 漫剧核心流程」。
          </p>
          <button
            type="button"
            data-testid="templates-unlock-all"
            className="mt-1 text-[11px] text-brand font-medium"
            onClick={() => {
              unlockFirstLane();
              setUnlocked(true);
            }}
          >
            解锁全部配方
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 nx9-scroll">
        {categories.map((cat) => {
          const items = listed.filter((t) => t.category === cat.key);
          if (items.length === 0) return null;
          return (
            <section key={cat.key}>
              <h3 className="text-[10px] uppercase tracking-wide text-ink/40 mb-2">{cat.label}</h3>
              <ul className="space-y-2">
                {items.map((tpl) => (
                  <li
                    key={tpl.id}
                    className="rounded-xl border border-line p-3 hover:border-brand/40 transition-colors"
                  >
                    <p className="font-medium text-sm text-ink">{tpl.label}</p>
                    <p className="text-xs text-ink/50 mt-1 leading-relaxed">{tpl.description}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          requestLoad(tpl.id, 'merge');
                          onClose();
                        }}
                        className="flex-1 text-xs rounded-lg bg-brand text-white py-1.5"
                      >
                        追加到画布
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          requestLoad(tpl.id, 'replace');
                          onClose();
                        }}
                        className="flex-1 text-xs rounded-lg border border-line py-1.5 hover:border-warn/40"
                      >
                        替换画布
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
