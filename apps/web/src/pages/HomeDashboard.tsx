import { useMemo } from 'react';
import { Clock, Film, Plus } from 'lucide-react';
import { api } from '../api/client';
import type { WorkspaceSummary } from '@nx9/shared';

export function HomeDashboard() {
  const workspaceList: WorkspaceSummary[] = [];

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">NX9 Studio</h1>
          <p className="text-sm text-ink/50 mt-1">AI 漫剧创作工作室</p>
        </div>
        <a
          href="/"
          className="flex items-center gap-1.5 rounded-xl bg-brand text-white px-4 py-2 text-sm"
        >
          <Plus size={16} /> 新创作
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <h2 className="text-sm font-semibold text-ink/70 flex items-center gap-2">
          <Clock size={16} /> 最近项目
        </h2>
        {workspaceList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink/40">
            <Film size={32} className="mx-auto mb-2 text-ink/20" />
            还没有项目，点击「新创作」开始
          </div>
        ) : (
          workspaceList.map((ws) => (
            <a
              key={ws.id}
              href={`/?workspace=${ws.id}`}
              className="rounded-xl border border-line p-4 hover:border-brand/30 transition-colors"
            >
              <span className="font-medium text-sm">{ws.title}</span>
              <span className="text-[11px] text-ink/40 block mt-1">{ws.blockCount} 工具 · {ws.shotCount ?? 0} 镜头</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
