import { useMemo, useState } from 'react';
import { ChevronDown, Clapperboard, ExternalLink, Film, Grid3x3 } from 'lucide-react';
import { useWorkspaceDocument } from '../../../../stores/workspace-document';
import { useStoryboardUi, useFlowRuntime, useRemotionUi } from '../../../../stores/flow-runtime';
import { useViewMode } from '../../stores/view-mode';
import { useContextRailUi } from '../../stores/context-rail-ui';
import { RailBanner } from './primitives/RailBanner';
import { RailSection } from './primitives/RailSection';
import { GridGeneratePanel } from '../GridGeneratePanel';

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
  const banner = useContextRailUi((s) => s.banner);
  const setBanner = useContextRailUi((s) => s.setBanner);
  const setStudioOpen = useRemotionUi((s) => s.setOpen);

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

  const previewShots = useMemo(() => shots.slice(0, 8), [shots]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof shots>();
    for (const shot of shots) {
      const key = shot.sceneCode || '未分组';
      const arr = map.get(key);
      if (arr) {
        arr.push(shot);
      } else {
        map.set(key, [shot]);
      }
    }
    return Array.from(map.entries());
  }, [shots]);

  const reviewCount = useMemo(
    () => shots.filter((s) => s.status === 'review').length,
    [shots],
  );

  const passedCount = useMemo(
    () => shots.filter((s) => s.status === 'approved').length,
    [shots],
  );

  return (
    <div className="space-y-3 text-xs">
      {/* Banner */}
      {banner && (
        <RailBanner
          kind={banner.kind}
          shotCount={banner.shotIds.length}
          onAction={() => {
            setOpen(true);
            setView('grid');
          }}
        />
      )}

      {reviewCount > 0 && !banner && (
        <RailBanner
          kind="review"
          shotCount={reviewCount}
          onAction={() => {
            setOpen(true);
            setView('grid');
          }}
        />
      )}

      {/* 统计 */}
      <p className="text-[11px] text-ink/50">
        {shots.length} 镜 · {reviewCount} 待审 · {passedCount} 已通过
      </p>

      {/* 主 CTA */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white h-9 text-sm hover:bg-brand/90"
      >
        <ExternalLink size={14} />
        打开故事板
      </button>

      <button
        type="button"
        onClick={() => setStudioOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-line h-9 text-xs hover:border-brand/40"
      >
        <Film size={14} />
        打开成片工作室
      </button>

      {viewMode === 'review' && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setView('grid');
          }}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-brand/30 bg-brand/5 text-brand h-9 text-xs hover:bg-brand/10"
        >
          <Grid3x3 size={14} />
          网格批审
        </button>
      )}

      {/* 关联镜头 */}
      {linked ? (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 space-y-1">
          <p className="font-medium text-brand">已关联镜头 #{linked.index}</p>
          <p className="text-[11px] text-ink/60 line-clamp-2">
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
        <p className="text-[11px] text-ink/50 leading-relaxed">
          选中已绑定分镜的模块后，可在此快速跳转。
        </p>
      )}

      {/* 快捷列表 - 按 sceneCode 分组折叠 */}
      {previewShots.length > 0 && (
        <RailSection title="快捷列表">
          <div className="space-y-2 max-h-80 overflow-y-auto nx9-scroll">
            {grouped.map(([sceneCode, groupShots]) => (
              <GroupSection
                key={sceneCode}
                sceneCode={sceneCode}
                count={groupShots.length}
              >
                <div className="space-y-1.5">
                  {groupShots.slice(0, 8).map((shot) => {
                    const hasThumb = !!shot.firstFrameAssetId;
                    return (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => {
                          selectShot(shot.id);
                          setOpen(true);
                          requestScroll(shot.id);
                        }}
                        className={`w-full flex items-center gap-2 rounded-lg border p-1.5 text-left ${
                          linked?.id === shot.id
                            ? 'border-brand/40 bg-brand/5'
                            : 'border-line hover:border-brand/30'
                        }`}
                      >
                        {hasThumb ? (
                          <img
                            src={shot.firstFrameAssetId!}
                            alt=""
                            className="w-10 h-10 rounded object-cover shrink-0 bg-surface"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-surface flex items-center justify-center shrink-0 text-ink/20">
                            <Clapperboard size={14} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-ink text-xs">#{shot.index}</span>
                          <span className="text-[10px] text-ink/50 ml-1 line-clamp-1">
                            {shot.descriptionZh || shot.promptEn || '未命名镜头'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {groupShots.length > 8 && (
                    <p className="text-[10px] text-ink/40 text-center pt-0.5">
                      +{groupShots.length - 8} 镜
                    </p>
                  )}
                </div>
              </GroupSection>
            ))}
          </div>
        </RailSection>
      )}

      {/* 宫格 */}
      <details className="group">
        <summary className="text-xs font-medium text-ink/60 cursor-pointer hover:text-ink/80">
          宫格 → 分镜
        </summary>
        <div className="mt-2">
          <GridGeneratePanel selectedBlockId={selectedBlockId} />
        </div>
      </details>
    </div>
  );
}

function GroupSection({
  sceneCode,
  count,
  children,
}: {
  sceneCode: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 bg-surface px-3 py-2 text-left hover:bg-surface/80"
      >
        <span className="font-medium text-ink text-xs">{sceneCode}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink/50">{count} 镜</span>
          <ChevronDown
            size={12}
            className={`text-ink/40 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </span>
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}
