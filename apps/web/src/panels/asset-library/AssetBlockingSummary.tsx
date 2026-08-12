import { useMemo, useState } from 'react';
import type { AssetLibraryKind } from '@nx9/shared';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import {
  summarizeLibraryBlocking,
  type AssetHealthAnalysis,
  type HealthIssueKey,
} from '../../engine/asset-library-health';

export function AssetBlockingSummary({
  analysis,
  tabs,
  onJump,
}: {
  analysis: AssetHealthAnalysis;
  /** 当前 scope 下可见的 Tab，避免公共词典噪音 */
  tabs?: AssetLibraryKind[];
  onJump: (tab: AssetLibraryKind, key: HealthIssueKey | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(
    () => summarizeLibraryBlocking(analysis, tabs ? { tabs } : undefined),
    [analysis, tabs],
  );

  if (summary.total <= 0) {
    return (
      <span className="hidden items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[10px] text-ok sm:inline-flex" title="仅表示无阻塞键（缺图/失效引用等），不含未使用或未锁定">
        无阻塞项
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[10px] font-medium text-warn hover:bg-warn/15"
        title="跨 Tab 阻塞项摘要"
      >
        <AlertTriangle size={12} />
        阻塞 {summary.total}
        {summary.invalidRefCount > 0 ? (
          <span className="text-warn/80">· 失效 {summary.invalidRefCount}</span>
        ) : null}
        <ChevronDown size={12} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] text-ink/45">点击跳转到对应 Tab 并过滤</p>
          {summary.byTab.map((row) => (
            <button
              key={row.tab}
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-ink/80 hover:bg-brand/10 hover:text-brand"
              onClick={() => {
                setOpen(false);
                onJump(row.tab, row.primaryKey);
              }}
            >
              <span>{row.label}</span>
              <span className="rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">{row.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
