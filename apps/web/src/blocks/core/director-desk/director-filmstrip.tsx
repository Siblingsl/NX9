import { statusBadge } from './status-badge';
import type { DirectorDeskQueueFilter } from '../../../engine/director-desk-runner';

interface Shot {
  id: string;
  index: number;
  durationSec?: number;
  shotType?: string;
  firstFrameAssetId?: string | null;
  keyframeStatus?: string;
  status: string;
  director3dGuide?: { captureUrl?: string } | null;
}

interface DirectorFilmstripProps {
  running: boolean;
  liveProgress: { done: number; total: number };
  barPct: number;
  stats: { total: number; withFrame: number };
  queueCounts: { missing: number; failed: number; selected: number; all: number };
  visibleShots: Shot[];
  lineArtByShotId: Record<string, string>;
  filter: DirectorDeskQueueFilter;
  selectedIds: Set<string>;
  currentShotId: string | undefined;
  runningShotId: string | null;
  blockId: string;
  focusShot: (shotId: string) => void;
  toggleSelect: (shotId: string) => void;
  selectAllVisible: () => void;
  clearSelect: () => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  onFilterChange: (value: string) => void;
  onGenerateShot: (shotId: string) => void;
}

export function DirectorFilmstrip({
  running,
  liveProgress,
  barPct,
  stats,
  queueCounts,
  visibleShots,
  lineArtByShotId,
  filter,
  selectedIds,
  currentShotId,
  runningShotId,
  blockId,
  focusShot,
  toggleSelect,
  selectAllVisible,
  clearSelect,
  updateNodeData,
  onFilterChange,
  onGenerateShot,
}: DirectorFilmstripProps) {
  const selectedCount = selectedIds.size;
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
        <div className="dd2-filmstrip__select-acts">
          <button type="button" className="dd2-filmstrip__sel-btn" onClick={selectAllVisible} title="全选可见">
            全选
          </button>
          <button type="button" className="dd2-filmstrip__sel-btn" onClick={clearSelect} title="清除选中">
            清除
          </button>
          <span className="dd2-filmstrip__sel-count">已选 {selectedCount}</span>
        </div>
        <select
          className="dd2-filmstrip__filter"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="镜头筛选"
        >
           <option value="missing">缺帧 / 失败 ({queueCounts.missing + queueCounts.failed})</option>
           <option value="failed">仅失败 ({queueCounts.failed})</option>
           <option value="selected">已选 ({queueCounts.selected})</option>
          <option value="3donly">仅有 3D</option>
           <option value="all">全部 ({queueCounts.all})</option>
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
            const isSelected = selectedIds.has(shot.id);
            const isFocused = currentShotId === shot.id;
            return (
              <div
                key={shot.id}
                className={`dd2-frame ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focus' : ''} ${runningShotId === shot.id ? 'is-run' : ''}`}
                onClick={() => {
                  focusShot(shot.id);
                  if (shot.firstFrameAssetId) {
                    updateNodeData(blockId, { previewUrl: shot.firstFrameAssetId });
                  }
                }}
              >
                <div className="dd2-frame__thumb">
                  <label
                    className="dd2-frame__check"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(shot.id)}
                    />
                  </label>
                  {shot.firstFrameAssetId || lineArtByShotId[shot.id] ? (
                    <img src={shot.firstFrameAssetId || lineArtByShotId[shot.id]} alt="" draggable={false} />
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
                  {!running ? (
                    <button
                      type="button"
                      className="dd2-frame__produce"
                      onClick={(e) => { e.stopPropagation(); onGenerateShot(shot.id); }}
                    >
                      出此镜
                    </button>
                  ) : null}
                </div>
            );
          })
        )}
      </div>
    </div>
  );
}
