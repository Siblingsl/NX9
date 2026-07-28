import { statusBadge } from './status-badge';
import type { DirectorDeskQueueFilter } from '../../../engine/director-desk-runner';

interface Shot {
  id: string;
  index: number;
  durationSec?: number;
  shotType?: string;
  firstFrameAssetId?: string | null;
  director3dGuide?: { captureUrl?: string } | null;
}

interface DirectorFilmstripProps {
  running: boolean;
  liveProgress: { done: number; total: number };
  barPct: number;
  stats: { total: number; withFrame: number };
  visibleShots: Shot[];
  filter: DirectorDeskQueueFilter;
  selectedIds: Set<string>;
  currentShotId: string | undefined;
  runningShotId: string | null;
  blockId: string;
  focusShot: (shotId: string) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  onFilterChange: (value: string) => void;
}

export function DirectorFilmstrip({
  running,
  liveProgress,
  barPct,
  stats,
  visibleShots,
  filter,
  selectedIds,
  currentShotId,
  runningShotId,
  blockId,
  focusShot,
  updateNodeData,
  onFilterChange,
}: DirectorFilmstripProps) {
  return (
    <div className="dd2-filmstrip">
      <div className="dd2-filmstrip__head">
        <div className="dd2-filmstrip__progress">
          <span>
            {running
              ? `批出 ${liveProgress.done}/${liveProgress.total}`
              : `${stats.withFrame}/${stats.total}`}
          </span>
          <div className="dd2-filmstrip__bar">
            <div className="dd2-filmstrip__fill" style={{ width: `${Math.min(100, barPct)}%` }} />
          </div>
        </div>
        <select
          className="dd2-filmstrip__filter"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="镜头筛选"
        >
          <option value="missing">缺帧 / 失败</option>
          <option value="failed">仅失败</option>
          <option value="selected">已选</option>
          <option value="3donly">仅有 3D</option>
          <option value="all">全部</option>
        </select>
      </div>
      <div className="dd2-filmstrip__list" data-scroll="filmstrip">
        {visibleShots.length === 0 ? (
          <p className="dd2-filmstrip__empty">
            {stats.total === 0 ? '暂无镜头 · 先走分镜台' : '该筛选下无镜头'}
          </p>
        ) : (
          visibleShots.map((shot) => {
            const badge = statusBadge(shot);
            return (
              <button
                key={shot.id}
                type="button"
                className={`dd2-frame ${selectedIds.has(shot.id) || currentShotId === shot.id ? 'is-on' : ''} ${runningShotId === shot.id ? 'is-run' : ''}`}
                onClick={() => {
                  focusShot(shot.id);
                  if (shot.firstFrameAssetId) {
                    updateNodeData(blockId, { previewUrl: shot.firstFrameAssetId });
                  }
                }}
              >
                <div className="dd2-frame__thumb">
                  {shot.firstFrameAssetId ? (
                    <img src={shot.firstFrameAssetId} alt="" draggable={false} />
                  ) : (
                    <span>#{shot.index}</span>
                  )}
                  {shot.director3dGuide?.captureUrl ? <i className="dd2-frame__3d" title="有 3D 参考" /> : null}
                </div>
                <div className="dd2-frame__meta">
                  <strong>#{shot.index}</strong>
                  <em>{shot.durationSec}s · {shot.shotType}</em>
                </div>
                <span className={`dd2-frame__badge ${badge.cls}`}>{badge.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
