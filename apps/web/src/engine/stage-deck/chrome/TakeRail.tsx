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

  /* 全屏舞台：悬在底部命令岛上方，不再预留旧编辑器底栏高度 */
  const railStyle = { bottom: 96, height: 88 } as const;

  if (!blockId) {
    return (
      <div
        className="nx9-take-rail absolute left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-48px))] z-[25] flex items-center justify-center text-xs text-white/40 border border-white/10 rounded-2xl bg-black/55 backdrop-blur-xl"
        style={railStyle}
      >
        选中节点以浏览 Take 候选
      </div>
    );
  }

  return (
    <div
      className="nx9-take-rail absolute left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-48px))] z-[25] border border-white/10 rounded-2xl bg-black/60 backdrop-blur-xl shadow-panel flex flex-col text-white/85"
      style={railStyle}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 shrink-0 gap-2">
        <span className="text-xs font-semibold text-white/70 shrink-0">
          Take · {takes.length}
          {pickedTake ? ` · v${takes.indexOf(pickedTake) + 1} 主版` : ''}
        </span>
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {latestTake && latestTake.id !== pickedTake?.id && (
            <button
              type="button"
              onClick={() => onPickTake(latestTake.id)}
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-white/15 hover:border-teal-400/40 text-white/60 shrink-0"
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
              className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-white/15 hover:border-teal-400/40 text-white/60 shrink-0"
            >
              <GitCompare size={11} />
              对比
            </button>
          )}
          <button
            type="button"
            onClick={() => blockId && runtime?.runSelected?.([blockId])}
            className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-teal-400/30 text-teal-300 shrink-0"
            title="重新运行此节点"
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
            className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-lg border border-white/15 hover:border-teal-400/40 text-white/60 shrink-0"
          >
            <Grid3x3 size={11} />
            批审
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-x-auto nx9-scroll px-2 py-2 flex gap-2 items-center">
        {takes.length === 0 ? (
          <span className="text-xs text-white/40 px-2">暂无 Take — 运行生成后会自动追加版本</span>
        ) : (
          takes.map((take, i) => (
            <button
              key={take.id}
              type="button"
              onClick={() => openLightbox(take.id)}
              onDoubleClick={() => onPickTake(take.id)}
              className={`relative shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-transform hover:scale-105 ${
                take.picked ? 'border-teal-400 ring-2 ring-teal-400/30' : 'border-white/15'
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
                <span className="text-[10px] text-white/40 flex items-center justify-center h-full">
                  Take
                </span>
              )}
              {take.picked && (
                <Star
                  size={10}
                  className="absolute top-0.5 right-0.5 text-warn fill-warn drop-shadow"
                />
              )}
              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-[9px] text-white text-center">
                v{i + 1}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
