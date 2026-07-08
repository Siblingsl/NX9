import { useCallback } from 'react';
import { PROMPT_TEMPLATE_CATEGORIES, PROMPT_TEMPLATES } from '@nx9/shared';
import { BookText, X } from 'lucide-react';
import { useFlowCommands } from '../stores/flow-commands';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useActivityLog } from '../stores/activity-log';

const FILLABLE_TYPES = new Set(['prompt', 'chat-model', 'memo', 'cinema-prompt', 'camera-prompt']);

export function PromptLibraryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);

  const applyToSelection = useCallback(
    (promptEn: string, label: string) => {
      if (!runtime) {
        appendLog('画布尚未就绪');
        return false;
      }
      const selected = runtime.getNodes().filter((n) => n.selected);
      const targets = selected.filter((n) => n.type && FILLABLE_TYPES.has(n.type));
      if (targets.length === 0) return false;

      for (const node of targets) {
        runtime.updateNodeData(node.id, { content: promptEn, status: 'idle' });
      }
      appendLog(`已填入 ${targets.length} 个模块：${label}`);
      return true;
    },
    [runtime, appendLog],
  );

  const spawnPrompt = useCallback(
    (promptEn: string, label: string) => {
      requestSpawn('prompt', undefined, { content: promptEn, status: 'idle' });
      appendLog(`已添加提示词模块：${label}`);
      onClose();
    },
    [requestSpawn, appendLog, onClose],
  );

  if (!open) return null;

  return (
    <aside className="w-[320px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-20 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <BookText size={18} className="text-brand" />
        <span className="font-semibold text-sm flex-1">提示词模板</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 nx9-scroll">
        {PROMPT_TEMPLATE_CATEGORIES.map((cat) => {
          const items = PROMPT_TEMPLATES.filter((t) => t.category === cat.key);
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
                    <p className="text-[10px] text-ink/40 mt-2 line-clamp-2 font-mono leading-relaxed">
                      {tpl.promptEn}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => spawnPrompt(tpl.promptEn, tpl.label)}
                        className="flex-1 text-xs rounded-lg bg-brand text-white py-1.5"
                      >
                        追加到画布
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const ok = applyToSelection(tpl.promptEn, tpl.label);
                          if (!ok) {
                            spawnPrompt(tpl.promptEn, tpl.label);
                          } else {
                            onClose();
                          }
                        }}
                        className="flex-1 text-xs rounded-lg border border-line py-1.5 hover:border-brand/40"
                      >
                        填入选中
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
