/**
 * UsagePanel — Token 用量仪表（F-009）。
 *
 * 展示近 7/30/90 日用量统计，按模型/类型/日聚合。
 * 入口：设置抽屉 / 命令面板。
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { api } from '../api/client';

interface UsageSummaryResponse {
  totalEvents: number;
  byKind: Record<string, number>;
  estimatedCostUnits: number;
  periodDays: number;
}

type UsageSummary = Awaited<ReturnType<typeof api.usageSummary>>;
type UsageRecentItem = Awaited<ReturnType<typeof api.usageRecent>>[number];
type UsageDailyItem = Awaited<ReturnType<typeof api.usageDaily>>[number];

const KIND_LABELS: Record<string, string> = {
  llm: '大语言模型',
  image: '图像生成',
  video: '视频生成',
  tts: '语音合成',
};

const KIND_COLORS: Record<string, string> = {
  llm: '#0F766E',
  image: '#A13D63',
  video: '#D97706',
  tts: '#1E3A5F',
};

export const UsagePanel = memo(function UsagePanel() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [recent, setRecent] = useState<UsageRecentItem[]>([]);
  const [daily, setDaily] = useState<UsageDailyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.usageSummary(days),
      api.usageRecent(30),
      api.usageDaily(days),
    ] as const)
      .then(([s, r, d]) => {
        if (cancelled) return;
        setSummary(s);
        setRecent(r);
        setDaily(d);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '用量服务不可用');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [days]);

  const totalByKind = summary?.byKind ?? {};
  const kindEntries = Object.entries(totalByKind).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const maxCount = Math.max(...kindEntries.map(([, count]) => count), 1);

  // F-009: 按日聚合数据，供折线/柱状图
  const dailyByDay = useMemo(() => {
    const map = new Map<string, { total: number; units: number; kinds: Record<string, number> }>();
    for (const d of daily) {
      const entry = map.get(d.day) ?? { total: 0, units: 0, kinds: {} };
      entry.total += d.count;
      entry.units += d.units;
      entry.kinds[d.kind] = (entry.kinds[d.kind] ?? 0) + d.count;
      map.set(d.day, entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [daily]);
  const dailyMaxTotal = Math.max(...dailyByDay.map(([, v]) => v.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
          <BarChart3 size={14} className="text-brand" />
          Token 用量仪表
        </h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-line px-2 py-1 text-[10px] bg-surface"
        >
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-ink/30" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-[11px] text-warn">
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/50 bg-surface/30 p-3 text-center">
              <p className="text-[9px] text-ink/40 uppercase tracking-wide">总调用</p>
              <p className="text-lg font-bold text-ink mt-0.5">{summary.totalEvents}</p>
              <p className="text-[8px] text-ink/30">{summary.periodDays} 天</p>
            </div>
            <div className="rounded-xl border border-line/50 bg-surface/30 p-3 text-center">
              <p className="text-[9px] text-ink/40 uppercase tracking-wide">消耗单元</p>
              <p className="text-lg font-bold text-ink mt-0.5">{summary.estimatedCostUnits}</p>
              <p className="text-[8px] text-ink/30">估算</p>
            </div>
            <div className="rounded-xl border border-line/50 bg-surface/30 p-3 text-center">
              <p className="text-[9px] text-ink/40 uppercase tracking-wide">模型类型</p>
              <p className="text-lg font-bold text-ink mt-0.5">{kindEntries.length}</p>
              <p className="text-[8px] text-ink/30">种</p>
            </div>
          </div>

          {/* F-009: 按日聚合折线/柱状图 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-ink/50">按日期</p>
              <button
                type="button"
                onClick={() => setChartMode(chartMode === 'bar' ? 'line' : 'bar')}
                className="text-[9px] text-brand/70 hover:text-brand px-1.5 py-0.5 rounded"
                title={chartMode === 'bar' ? '切换为折线图' : '切换为柱状图'}
              >
                <TrendingUp size={12} className={chartMode === 'line' ? 'text-brand' : 'text-ink/30'} />
              </button>
            </div>
            {dailyByDay.length === 0 ? (
              <p className="text-[10px] text-ink/30 text-center py-2">暂无调用记录</p>
            ) : (
              <div className="flex items-end gap-[2px] h-20 px-1">
                {dailyByDay.map(([day, val]) => {
                  const h = Math.max(2, (val.total / dailyMaxTotal) * 100);
                  return (
                    <div
                      key={day}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                      title={`${day}: ${val.total} 次调用, ${val.units} 单元`}
                    >
                      <div
                        className={`w-full rounded-sm transition-all ${
                          chartMode === 'line'
                            ? 'rounded-full'
                            : 'rounded-t-sm rounded-b-none'
                        }`}
                        style={{
                          height: `${h}%`,
                          background: chartMode === 'line'
                            ? '#6366F1'
                            : `linear-gradient(to top, #6366F1, #818CF8)`,
                          opacity: chartMode === 'line' ? 0.85 : 1,
                        }}
                      />
                      {/* tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-surface border border-line rounded px-1.5 py-0.5 text-[8px] text-ink/70 whitespace-nowrap z-10">
                        {day.slice(5)} · {val.total}次
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 日期标签 */}
            {dailyByDay.length > 0 && (
              <div className="flex justify-between text-[7px] text-ink/25 px-0.5">
                <span>{dailyByDay[0]?.[0]?.slice(5)}</span>
                <span>{dailyByDay[dailyByDay.length - 1]?.[0]?.slice(5)}</span>
              </div>
            )}
          </div>

          {/* 按类型柱状图 */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-ink/50">按类型</p>
            {kindEntries.map(([kind, count]) => (
              <div key={kind} className="flex items-center gap-2">
                <span className="w-16 text-[9px] text-ink/60 shrink-0">
                  {KIND_LABELS[kind] ?? kind}
                </span>
                <div className="flex-1 h-4 rounded-full bg-surface/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      background: KIND_COLORS[kind] ?? '#0F766E',
                    }}
                  />
                </div>
                <span className="w-8 text-right text-[9px] text-ink/40">{count}</span>
              </div>
            ))}
            {kindEntries.length === 0 && (
              <p className="text-[10px] text-ink/30 text-center py-3">暂无调用记录</p>
            )}
          </div>

          {/* F-009: 按模型聚合 */}
          {recent.length > 0 && (() => {
            const byModel: Record<string, number> = {};
            for (const ev of recent) {
              const key = ev.model || '未知';
              byModel[key] = (byModel[key] ?? 0) + ev.units;
            }
            const modelEntries = Object.entries(byModel).sort((a, b) => b[1] - a[1]);
            const maxModel = modelEntries[0]?.[1] ?? 1;
            return (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-ink/50">按模型</p>
                {modelEntries.map(([model, units]) => (
                  <div key={model} className="flex items-center gap-2">
                    <span className="w-24 text-[9px] text-ink/60 truncate shrink-0" title={model}>
                      {model}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-surface/50 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(units / maxModel) * 100}%`,
                          background: '#6366F1',
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-[9px] text-ink/40">{units}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 最近事件 */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-ink/50">最近调用</p>
            {recent.length === 0 ? (
              <p className="text-[10px] text-ink/30 text-center py-3">暂无调用记录</p>
            ) : (
              <div className="max-h-32 space-y-0.5 overflow-y-auto nx9-scroll">
                {recent.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between text-[9px] text-ink/50">
                    <span>
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                        style={{ background: KIND_COLORS[ev.kind] ?? '#999' }}
                      />
                      {KIND_LABELS[ev.kind] ?? ev.kind}
                      {ev.model ? ` · ${ev.model}` : ''}
                    </span>
                    <span className="text-ink/30">
                      {new Date(ev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !error && !summary && (
        <p className="text-[10px] text-ink/30 text-center py-6">用量服务不可用</p>
      )}
    </div>
  );
});
