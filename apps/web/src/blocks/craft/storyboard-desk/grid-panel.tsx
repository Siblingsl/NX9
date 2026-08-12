import React from 'react';
import { emptyStoryboardPreview } from '@nx9/shared';
import { applyDeskBreakdown, addShotToBreakdown, splitShotInBreakdown, mergeShotsInBreakdown, reorderShotsInBreakdown, stripEpisodeConfirmation } from '../../../engine/storyboard-desk-runner';
import {
  applyAssetDragToShot,
  hasNx9AssetDrag,
  readNx9AssetDragData,
  type Nx9AssetDragPayload,
} from '../../../engine/asset-library-drag';
import { askConfirm } from '../../../stores/confirm-dialog';
import { toastError, toastSuccess } from '../../../stores/toast';
import { ShotStoryCell } from './shot-story-cell';
import { patchShotInPayload } from './helpers';

interface GridPanelProps {
  blockId: string;
  blockData?: Record<string, unknown>;
  payload: any;
  visibleShots: any[];
  deskBusy: boolean;
  setStudioTab: React.Dispatch<React.SetStateAction<any>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  editingShotId: string | null;
  /** SB-OL-13: 撤销栈深度用 state 跟踪，按钮禁用态可随渲染刷新 */
  canUndo: boolean;
  undo: () => void;
  selectedShotIds: Set<string>;
  setSelectedShotIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleShotChecked: (id: string) => void;
  generatingShotId: string | null | undefined;
  batchRunning: boolean;
  storyboardUrlByShotId: Map<string, string>;
  updateNodeData: (id: string, data: any) => void;
  currentEpisodeId: string | null;
  appendLog: (msg: string) => void;
  pushUndo: (p: any) => void;
  setShotFrameUrl: (shotId: string, url: string) => void;
  generateShotLineArt: (shot: any) => Promise<void>;
  openEdit: (shotId: string) => void;
  handleDeleteShot: (shotId: string) => Promise<void>;
  handleClearLineArt: (shotId: string) => Promise<void>;
  handleCopyShot: (shotId: string) => void;
  handleCopySelected: () => void;
  handleDeleteSelected: () => Promise<void>;
  /** 合镜会换新 id，必须清掉被合并镜的预览帧 */
  cleanupFramesForShots: (shotIds: string[]) => void;
}

const GridPanel: React.FC<GridPanelProps> = ({
  blockId,
  blockData,
  payload,
  visibleShots,
  deskBusy,
  setStudioTab,
  selectedId,
  setSelectedId,
  editingShotId,
  canUndo,
  undo,
  selectedShotIds,
  setSelectedShotIds,
  toggleShotChecked,
  generatingShotId,
  batchRunning,
  storyboardUrlByShotId,
  updateNodeData,
  currentEpisodeId,
  appendLog,
  pushUndo,
  setShotFrameUrl,
  generateShotLineArt,
  openEdit,
  handleDeleteShot,
  handleClearLineArt,
  handleCopyShot,
  handleCopySelected,
  handleDeleteSelected,
  cleanupFramesForShots,
}) => {
  const handleReset = async () => {
    const ok = await askConfirm({
      title: '重置本台？',
      description: '将清除本台全部镜表、预览帧、确认状态。已生成的线稿文件不会被删除。',
      confirmLabel: '确认重置',
      tone: 'danger',
    });
    if (!ok) return;
    if (payload) pushUndo(payload);
    applyDeskBreakdown(blockId, { version: 1, title: '', sourceText: '', generatedAt: new Date().toISOString(), episodes: [] }, updateNodeData, {
      gridConfirmed: false,
      confirmedEpisodeIds: [],
    });
    updateNodeData(blockId, { storyboardPreview: emptyStoryboardPreview(), contactSheetUrl: undefined });
    setSelectedId(null);
    appendLog('已重置本台 · 镜表/预览/确认态已清除');
  };

  const handleAddShot = () => {
    if (!payload || !selectedId) return;
    pushUndo(payload);
    const next = addShotToBreakdown(payload, selectedId);
    applyDeskBreakdown(blockId, next, updateNodeData, {
      ...stripEpisodeConfirmation(blockData, currentEpisodeId),
    });
    appendLog('已新增镜');
  };

  const handleSplitShot = () => {
    if (!payload || !selectedId) return;
    pushUndo(payload);
    const next = splitShotInBreakdown(payload, selectedId);
    applyDeskBreakdown(blockId, next, updateNodeData, {
      ...stripEpisodeConfirmation(blockData, currentEpisodeId),
    });
    appendLog('已拆分镜');
  };

  const handleMergeShot = () => {
    if (!payload || !selectedId) return;
    const idx = visibleShots.findIndex((s) => s.id === selectedId);
    if (idx < 1) {
      toastError('请选择非首镜与前镜合并');
      return;
    }
    const ids = [visibleShots[idx - 1].id, selectedId];
    const next = mergeShotsInBreakdown(payload, ids);
    if (next === payload) return;
    pushUndo(payload);
    applyDeskBreakdown(blockId, next, updateNodeData, {
      ...stripEpisodeConfirmation(blockData, currentEpisodeId),
    });
    cleanupFramesForShots(ids);
    const merged = next.episodes
      .flatMap((ep: { shots: Array<{ id: string }> }) => ep.shots)
      .find((s: { id: string }) => s.id.startsWith('shot-merged-'));
    setSelectedId(merged?.id ?? null);
    appendLog('已合并镜');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    // OL-16：库卡拖入镜格 → 按类型薄绑定
    if (hasNx9AssetDrag(e.dataTransfer) && payload) {
      const asset = readNx9AssetDragData(e.dataTransfer);
      const target = (e.target as HTMLElement).closest('.sg-story-cell');
      const toId = target?.getAttribute('data-shot-id');
      if (asset && toId) {
        const shot = visibleShots.find((s: { id: string }) => s.id === toId);
        if (shot) {
          const applied = applyAssetDragToShot(shot, asset as Nx9AssetDragPayload);
          if (!applied) {
            if (asset.kind === 'costume' && !(shot.characters?.length > 0)) {
              toastError('请先为本镜绑定角色，再拖入服装');
            } else {
              toastError('该素材已绑定或无法应用到本镜');
            }
            return;
          }
          pushUndo(payload);
          const next = patchShotInPayload(payload, toId, applied.shot);
          applyDeskBreakdown(blockId, next, updateNodeData, {
            ...stripEpisodeConfirmation(blockData, currentEpisodeId),
          });
          setSelectedId(toId);
          appendLog(applied.message);
          toastSuccess(applied.message);
          return;
        }
      }
    }

    const fromId = e.dataTransfer.getData('text/shot-id');
    if (!fromId || !payload || !currentEpisodeId) return;
    const episode = payload.episodes.find((ep: any) => ep.id === currentEpisodeId);
    if (!episode) return;
    const shotIds = episode.shots.map((s: any) => s.id);
    if (shotIds.length < 2 || !shotIds.includes(fromId)) return;
    const target = (e.target as HTMLElement).closest('.sg-story-cell');
    const toId = target?.getAttribute('data-shot-id');
    if (!toId || fromId === toId) return;
    const ordered = [...shotIds];
    const fromIdx = ordered.indexOf(fromId);
    const toIdx = ordered.indexOf(toId);
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, fromId);
    pushUndo(payload);
    const next = reorderShotsInBreakdown(payload, currentEpisodeId, ordered);
    applyDeskBreakdown(blockId, next, updateNodeData, {
      ...stripEpisodeConfirmation(blockData, currentEpisodeId),
    });
    appendLog('已排序镜');
  };

  return (
    <div className="sg3-pane">
      {!payload || visibleShots.length === 0 ? (
        <div className="sg3-empty-hero">
          <h3>本集暂无镜头</h3>
          <p>请先完成拆镜，或导入旧镜表。</p>
          {!payload ? (
            <div className="sg3-onboard" style={{ marginTop: 20, padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 12, fontSize: 13, lineHeight: 1.8, textAlign: 'left', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
              <p className="sg3-onboard__hint">三步完成分镜准备：</p>
              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><b>拆镜</b>：从编剧台成稿自动生成镜表</li>
                <li><b>出线稿</b>：在构图 Tab 批量生成分镜线稿</li>
                <li><b>确认交接</b>：满足覆盖率后确认，并打开导演台</li>
              </ol>
            </div>
          ) : null}
          <button type="button" className="sg3-btn sg3-btn--primary" onClick={() => setStudioTab('breakdown')}>
            去拆镜
          </button>
        </div>
      ) : (
        <>
          <div className="sg3-toolbar">
            <div className="sg3-toolbar__meta">
              镜 {visibleShots.length}
              {selectedId ? ` · 已选 #${visibleShots.find((s) => s.id === selectedId)?.index ?? ''}` : ''}
            </div>
            <div className="sg3-toolbar__acts">
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!canUndo || deskBusy}
                title="撤销最近一次变更（镜表结构、字段编辑、重置本台）"
                onClick={() => undo()}
              >
                撤销
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={deskBusy || !payload}
                title="清除本台镜表/预览/确认态（可撤销）"
                onClick={handleReset}
              >
                重置本台
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!selectedId || deskBusy}
                title="在当前镜后插入新镜"
                onClick={handleAddShot}
              >
                + 增镜
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!selectedId || deskBusy}
                title="将当前镜一分为二"
                onClick={handleSplitShot}
              >
                拆镜
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!selectedId || visibleShots.length < 2 || deskBusy}
                title="合并当前选中镜与前镜"
                onClick={handleMergeShot}
              >
                合镜
              </button>
            </div>
          </div>
          <p className="sg3-hint">
            镜表管结构与字段；批量出线稿以「构图」Tab 为准，卡片 ✨ 仅为单镜快捷入口。
          </p>
          {selectedShotIds.size > 0 ? (
            <div className="sg3-toolbar" style={{ marginTop: 4 }}>
              <div className="sg3-toolbar__meta">
                已选 {selectedShotIds.size} 镜
              </div>
              <div className="sg3-toolbar__acts">
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  disabled={deskBusy}
                  onClick={() => handleCopySelected()}
                >
                  复制选中
                </button>
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  disabled={deskBusy}
                  onClick={() => { setSelectedShotIds(new Set()); }}
                >
                  取消选中
                </button>
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  style={{ color: 'var(--desk-err)' }}
                  disabled={deskBusy}
                  onClick={() => void handleDeleteSelected()}
                >
                  删选中
                </button>
              </div>
            </div>
          ) : null}
          <p className="sg3-hint">点画面可上传 · 卡片底栏：线稿 / 编辑 · 彩色关键帧请到导演台批出</p>
          <div
            className="sg3-board sg-story-grid"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = hasNx9AssetDrag(e.dataTransfer) ? 'copy' : 'move';
            }}
            onDrop={handleDrop}
          >
            {visibleShots.map((shot) => (
              <ShotStoryCell
                key={shot.id}
                shot={shot}
                selected={selectedId === shot.id || editingShotId === shot.id}
                checked={selectedShotIds.has(shot.id)}
                storyboardUrl={storyboardUrlByShotId.get(shot.id)}
                generating={
                  generatingShotId === shot.id
                  || (batchRunning && generatingShotId === shot.id)
                }
                onSelect={() => setSelectedId(shot.id)}
                onToggleCheck={() => toggleShotChecked(shot.id)}
                deskBusy={deskBusy && generatingShotId !== shot.id}
                onUpload={(url) => {
                  setShotFrameUrl(shot.id, url);
                  appendLog(`分镜画面已上传 · ${shot.sceneCode || shot.id}`);
                }}
                onGenerateLineArt={() => void generateShotLineArt(shot)}
                onEdit={() => openEdit(shot.id)}
                onDelete={() => void handleDeleteShot(shot.id)}
                onClearLineArt={() => void handleClearLineArt(shot.id)}
                onCopy={() => handleCopyShot(shot.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/shot-id', shot.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default GridPanel;
