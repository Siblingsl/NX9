import React from 'react';
import { emptyStoryboardPreview } from '@nx9/shared';
import { applyDeskBreakdown, addShotToBreakdown, splitShotInBreakdown, mergeShotsInBreakdown, reorderShotsInBreakdown, stripEpisodeConfirmation } from '../../../engine/storyboard-desk-runner';
import { askConfirm } from '../../../stores/confirm-dialog';
import { useToast } from '../../../stores/toast';
import { ShotStoryCell } from './shot-story-cell';

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
  undoStackRef: React.MutableRefObject<any[]>;
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
  undoStackRef,
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
}) => {
  const handleReset = async () => {
    const ok = await askConfirm({
      title: '重置本台？',
      description: '将清除本台全部镜表、预览帧、确认状态。已生成的线稿文件不会被删除。',
      confirmLabel: '确认重置',
      tone: 'danger',
    });
    if (!ok) return;
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
      useToast.getState().push({ message: '请选择非首镜与前镜合并', variant: 'error' });
      return;
    }
    const ids = [visibleShots[idx - 1].id, selectedId];
    pushUndo(payload);
    const next = mergeShotsInBreakdown(payload, ids);
    applyDeskBreakdown(blockId, next, updateNodeData, {
      ...stripEpisodeConfirmation(blockData, currentEpisodeId),
    });
    appendLog('已合并镜');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
                disabled={undoStackRef.current.length === 0 || deskBusy}
                title="撤销最近一次结构变更"
                onClick={() => undo()}
              >
                撤销
              </button>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={deskBusy || !payload}
                title="清除本台镜表/预览/确认态"
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
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
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
