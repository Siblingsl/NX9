import { useCallback, useEffect, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import type { UsageSummary } from '@nx9/shared';
import { api } from '../api/client';
import { useUserSession } from '../stores/user-session';

export function UsagePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const userId = useUserSession((s) => s.userId);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [recent, setRecent] = useState<
    { id: string; kind: string; model?: string | null; units: number; createdAt: number }[]
  >([]);

  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([
      api.usageSummary(7, userId ?? undefined),
      api.usageRecent(30, userId ?? undefined),
    ]);
    setSummary(s);
    setRecent(r);
  }, [userId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const KIND_LABEL: Record<string, string> = {
    llm: 'LLM',
    image: '图像',
    video: '视频',
    tts: '配音',
  };

  return (
    <aside className="w-[320px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-30 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <BarChart3 size={18} className="text-warn" />
        <span className="font-semibold text-sm flex-1">用量追踪</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="p-3 border-b border-line space-y-2">
        {summary ? (
          <>
            <p className="text-2xl font-semibold text-brand">{summary.estimatedCostUnits}</p>
            <p className="text-xs text-ink/50">预估消耗单位 · 近 {summary.periodDays} 天</p>
            <p className="text-xs text-ink/60">共 {summary.totalEvents} 次 API 调用</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {Object.entries(summary.byKind).map(([k, n]) => (
                <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line">
                  {KIND_LABEL[k] ?? k}: {n}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-ink/50">加载中…</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        <p className="text-xs font-medium text-ink/60 px-1 mb-1">最近调用</p>
        {recent.length === 0 ? (
          <p className="text-xs text-ink/40 text-center py-8">暂无记录</p>
        ) : (
          <ul className="space-y-1">
            {recent.map((e) => (
              <li key={e.id} className="text-[10px] rounded-lg border border-line px-2 py-1.5 flex justify-between">
                <span>
                  <span className="text-brand font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  {e.model && <span className="text-ink/40 ml-1">{e.model}</span>}
                </span>
                <span className="text-ink/40 font-mono">
                  +{e.units} · {new Date(e.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
