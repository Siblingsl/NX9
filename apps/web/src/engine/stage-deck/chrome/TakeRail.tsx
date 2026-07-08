import { useMemo } from 'react';
import { GitCompare, Grid3x3, RotateCcw, Star } from 'lucide-react';
import { useTakeStore } from '../stores/take-store';
import { useStoryboardUi, useFlowRuntime } from '../../../stores/flow-runtime';

interface TakeRailProps {
  blockId: string | null;
  onPickTake: (takeId: string) => void;
}

export function TakeRail({ blockId, onPickTake }: TakeRailProps) {
  const allTakes = useTakeStore((s) => s.takes);
  const takes = useMemo(
    () =>
      blockId
        ? allTakes
            .filter((t) => t.blockId === blockId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    [allTakes, blockId],
  );
  const openLightbox = useTakeStore((s) => s.openLightbox);
  const openCompare = useTakeStore((s) => s.openCompare);
  const setStoryboardView = useStoryboardUi((s) => s.setView);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const runtime = useFlowRuntime((s) => s.runtime);

  const latestTake = takes.length > 0 ? takes[takes.length - 1] : undefined;
  const pickedTake = takes.find((t) => t.picked);
  const canCompare = takes.length >= 2;

  if (!blockId) {
    return (
      <div
        className="nx9-take-rail absolute left-12 right-12 z-[25] flex items-center justify-center text-xs text-ink/40 border border-line rounded-t-xl bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)]"
        style={{ bottom: 'calc(var(--nx9-deck-height) + 12px)', height: 88 }}
      >
        选中模块以浏览 Take 候选
      </div>
    );
  }

  return (
    <div
      className="nx9-take-rail absolute left-12 right-12 z-[25] border border-line rounded-t-xl bg-[var(--nx9-glass)] backdrop-blur-[var(--nx9-glass-blur)] shadow-panel flex flex-col"
      style={{ bottom: 'calc(var(--nx9-deck-height) + 12px)', height: 88 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line/60 shrink-0 gap-2">
        <span className="text-xs font-semibold text-ink/70 shrink-0">
          Take · {takes.length}
          {pickedTake ? ` · v${takes.indexOf(pickedTake) + 1} 主版` : ''}
        </span>
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {latestTake && latestTake.id !== pickedTake?.id && (
            <button
              type="button"
              onClick={() => onPickTake(latestTake.id)}
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-line hover:border-brand/40 text-ink/60 shrink-0"
              title="将最新 Take 设为主版"
            >
              <Star size={11} />
              最新
            </button>
          )}
          {canCompare && (
            <button
              type="button"
              onClick={() => openCompare(takes[takes.length - 2].id, takes[takes.length - 1].id)}
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-line hover:border-brand/40 text-ink/60 shrink-0"
            >
              <GitCompare size={11} />
              对比
            </button>
          )}
          <button
            type="button"
            onClick={() => blockId && runtime?.runSelected?.([blockId])}
            className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-line hover:border-brand/40 text-brand shrink-0"
            title="重新运行此模块"
          >
            <RotateCcw size={11} />
            重跑
          </button>
          <button
            type="button"
            onClick={() => {
              setStoryboardOpen(true);
              setStoryboardView('grid');
            }}
            className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-line hover:border-brand/40 text-ink/60 shrink-0"
          >
            <Grid3x3 size={11} />
            批审
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-x-auto nx9-scroll px-2 py-2 flex gap-2 items-center">
        {takes.length === 0 ? (
          <span className="text-xs text-ink/40 px-2">暂无 Take — 运行生成后会自动追加版本</span>
        ) : (
          takes.map((take, i) => (
            <button
              key={take.id}
              type="button"
              onClick={() => openLightbox(take.id)}
              onDoubleClick={() => onPickTake(take.id)}
              className={`relative shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-transform hover:scale-105 ${
                take.picked ? 'border-brand ring-2 ring-brand/30' : 'border-line'
              }`}
              title={take.picked ? '主 Take（双击设为当前）' : `Take ${i + 1} · 双击设为主版`}
            >
              {take.thumbUrl || take.assetUrl ? (
                <img
                  src={take.thumbUrl ?? take.assetUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-ink/40 flex items-center justify-center h-full">
                  Take
                </span>
              )}
              {take.picked && (
                <Star
                  size={10}
                  className="absolute top-0.5 right-0.5 text-warn fill-warn drop-shadow"
                />
              )}
              <span className="absolute bottom-0 inset-x-0 bg-ink/50 text-[9px] text-white text-center">
                v{i + 1}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
