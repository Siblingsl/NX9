import { useMemo } from 'react';
import { Clapperboard, ExternalLink, Grid3x3 } from 'lucide-react';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useStoryboardUi, useFlowRuntime } from '../../../../stores/flow-runtime';
import { useViewMode } from '../../stores/view-mode';

interface StoryboardRailPanelProps {
  selectedBlockId: string | null;
}

export function StoryboardRailPanel({ selectedBlockId }: StoryboardRailPanelProps) {
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const setOpen = useStoryboardUi((s) => s.setOpen);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const requestScroll = useStoryboardUi((s) => s.requestScrollToShot);
  const setView = useStoryboardUi((s) => s.setView);
  const runtime = useFlowRuntime((s) => s.runtime);
  const viewMode = useViewMode((s) => s.mode);

  const linked = useMemo(() => {
    if (!selectedBlockId) return undefined;
    return shots.find(
      (s) =>
        s.linkedBlockId === selectedBlockId ||
        s.id ===
          (runtime?.getNodes().find((n) => n.id === selectedBlockId)?.data
            ?.linkedShotId as string),
    );
  }, [selectedBlockId, shots, runtime]);

  const previewShots = useMemo(() => shots.slice(0, 12), [shots]);

  return (
    <div className="space-y-3 text-xs">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1 rounded-xl border border-line py-2 hover:border-brand/40"
      >
        <ExternalLink size={14} />
        打开故事板面板
      </button>

      {viewMode === 'review' && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setView('grid');
          }}
          className="w-full flex items-center justify-center gap-1 rounded-xl border border-brand/30 bg-brand/5 text-brand py-2 hover:bg-brand/10"
        >
          <Grid3x3 size={14} />
          网格批审
        </button>
      )}

      {linked ? (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 space-y-1">
          <p className="font-medium text-brand">已关联镜头 #{linked.index}</p>
          <p className="text-ink/60 line-clamp-2">
            {linked.descriptionZh || linked.promptEn || '—'}
          </p>
          <button
            type="button"
            onClick={() => {
              selectShot(linked.id);
              setOpen(true);
              requestScroll(linked.id);
            }}
            className="text-[10px] text-brand hover:underline flex items-center gap-1"
          >
            <Clapperboard size={12} />
            定位到镜头
          </button>
        </div>
      ) : (
        <p className="text-ink/50 leading-relaxed">
          选中已绑定分镜的模块后，可在此快速跳转。
        </p>
      )}

      {previewShots.length > 0 && (
        <ul className="space-y-1 max-h-40 overflow-y-auto nx9-scroll">
          {previewShots.map((shot) => (
            <li key={shot.id}>
              <button
                type="button"
                onClick={() => {
                  selectShot(shot.id);
                  setOpen(true);
                  requestScroll(shot.id);
                }}
                className={`w-full text-left rounded-lg px-2 py-1.5 border ${
                  linked?.id === shot.id
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-line hover:border-brand/30'
                }`}
              >
                <span className="font-medium text-ink">#{shot.index}</span>
                <span className="text-ink/50 ml-1 line-clamp-1">
                  {shot.descriptionZh || shot.promptEn || '未命名镜头'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
