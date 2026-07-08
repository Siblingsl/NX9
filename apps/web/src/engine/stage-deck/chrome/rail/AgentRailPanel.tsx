import { useState } from 'react';
import { Bot, Check, X } from 'lucide-react';
import { useCanvasAgentStore } from '../../stores/canvas-agent-store';
import { useFlowRuntime } from '../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../stores/activity-log';

export function AgentRailPanel() {
  const pendingOps = useCanvasAgentStore((s) => s.pendingOps);
  const proposeOp = useCanvasAgentStore((s) => s.proposeOp);
  const confirmOp = useCanvasAgentStore((s) => s.confirmOp);
  const rejectOp = useCanvasAgentStore((s) => s.rejectOp);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    const text = prompt.trim();
    if (!text || !runtime) return;

    const selected = runtime.getNodes().filter((n) => n.selected);
    if (selected.length === 0) {
      appendLog('Agent：请先选中模块');
      return;
    }

    proposeOp({
      summary: `调整 ${selected.length} 个模块`,
      detail: text,
      apply: () => {
        selected.forEach((n) => {
          runtime.updateNodeData(n.id, {
            content: `${(n.data?.content as string) ?? ''}\n${text}`.trim(),
          });
        });
        appendLog('Agent 变更已应用');
      },
    });
    setPrompt('');
  };

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink/50 leading-relaxed flex items-start gap-1">
        <Bot size={14} className="shrink-0 mt-0.5" />
        Canvas Agent 预览：提交后生成待确认操作卡片，点击「应用」才会写入画布。
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述要对选中模块做的调整…"
        className="w-full min-h-[72px] rounded-xl border border-line px-2 py-1.5 text-sm resize-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-xl bg-accent text-white py-2 hover:bg-accent/90"
      >
        生成待确认操作
      </button>

      {pendingOps.length > 0 && (
        <ul className="space-y-2 pt-2 border-t border-line">
          {pendingOps.map((op) => (
            <li key={op.id} className="rounded-xl border border-warn/30 bg-warn/5 p-3 space-y-2">
              <p className="font-medium text-ink">{op.summary}</p>
              {op.detail && <p className="text-ink/60 line-clamp-3">{op.detail}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => confirmOp(op.id)}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-ok/15 text-ok py-1.5"
                >
                  <Check size={12} />
                  应用
                </button>
                <button
                  type="button"
                  onClick={() => rejectOp(op.id)}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-line py-1.5"
                >
                  <X size={12} />
                  拒绝
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
