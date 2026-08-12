import {
  isShotKeyframeApproved,
  isShotKeyframeFailed,
  isShotMissingKeyframe,
  openReviewAfterDirectorBatch,
  syncStyleToPictureGen,
} from '../../../engine/director-desk-runner';

interface Shot {
  id: string;
  index: number;
  durationSec?: number;
  firstFrameAssetId?: string | null;
  keyframeReviewNote?: string;
  keyframePreviousUrl?: string | null;
}

interface DirectorDeliverTabProps {
  blockId: string;
  sortedShots: Shot[];
  reviewStats: { total: number; missing: number; pending: number; failed: number; approved: number };
  keyframeGatePassed: boolean;
  running: boolean;
  handleApproveShot: (shotId: string) => void;
  handleApproveAll: () => void;
  handleUnapproveShot: (shotId: string) => void;
  handleUnapproveAll: () => Promise<void>;
  handleRestoreShot: (shotId: string) => void;
  handleRejectShot: (shotId: string, regenerate: boolean) => Promise<void>;
  rejectDrafts: Record<string, string>;
  setRejectDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  rejectEditingId: string | null;
  setRejectEditingId: (v: string | null) => void;
  rejectBusyId: string | null;
  pictureNode: { data: Record<string, unknown> } | null;
  clipNode: { id: string } | null;
  stats: { total: number; withFrame: number };
  nodes: unknown[];
  edges: unknown[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  appendLog: (msg: string) => void;
  focusShot: (shotId: string) => void;
  styleSeed: number | null;
  stylePrompt: string;
  handlePushClipGen: (force?: boolean) => void | Promise<void>;
  onGoToMissing: () => void;
  lastPushReceipt?: { at?: string; shotCount?: number; clipGenId?: string };
  reviewMode: 'manual' | 'auto';
  /** DD-P1-03：外审显式作用域 */
  episodeId?: string | null;
  sourceChainDeskId?: string;
  reviewShots?: import('@nx9/shared').StoryboardShot[];
  clipBatchLabel?: string | null;
}

export function DirectorDeliverTab({
  blockId,
  sortedShots,
  reviewStats,
  keyframeGatePassed,
  running,
  handleApproveShot,
  handleApproveAll,
  handleUnapproveShot,
  handleUnapproveAll,
  handleRestoreShot,
  handleRejectShot,
  rejectDrafts,
  setRejectDrafts,
  rejectEditingId,
  setRejectEditingId,
  rejectBusyId,
  pictureNode,
  clipNode,
  stats,
  nodes,
  edges,
  updateNodeData,
  appendLog,
  focusShot,
  styleSeed,
  stylePrompt,
  handlePushClipGen,
  onGoToMissing,
  lastPushReceipt,
  reviewMode,
  episodeId,
  sourceChainDeskId,
  reviewShots,
  clipBatchLabel,
}: DirectorDeliverTabProps) {
  return (
    <div className="dd2-deliver">
      <div className="dd2-deliver__intro">
        <h3>审阅送出</h3>
         <p>台内批审关键帧 → 写回风格 → 放行后推送视频生成。审阅：{reviewMode === 'manual' ? '手动' : '生成即通过'}。外审宫格仍可用，不替代本页批审。</p>
      </div>

      <section className="dd2-review" aria-label="关键帧批审">
        <div className="dd2-review__head">
          <div className="dd2-review__stats">
            <span>共 {reviewStats.total}</span>
            <span className={reviewStats.missing ? 'is-warn' : ''}>缺图 {reviewStats.missing}</span>
            <span className={reviewStats.pending || reviewStats.failed ? 'is-warn' : ''}>
              待审 {reviewStats.pending + reviewStats.failed}
            </span>
            <span className={keyframeGatePassed ? 'is-ok' : ''}>已过 {reviewStats.approved}</span>
            <em className={keyframeGatePassed ? 'is-ok' : 'is-warn'}>
              {keyframeGatePassed ? '门禁已放行' : '门禁未放行'}
            </em>
          </div>
          <div className="dd2-review__acts">
            <button
              type="button"
              className="dd2-btn dd2-btn--ghost"
               disabled={running || reviewStats.total === 0 || reviewStats.missing > 0 || keyframeGatePassed}
              onClick={handleApproveAll}
            >
              全部通过
            </button>
            {keyframeGatePassed ? (
              <button type="button" className="dd2-btn dd2-btn--ghost" disabled={running} onClick={() => void handleUnapproveAll()}>
                撤销全部通过
              </button>
            ) : null}
            <button
              type="button"
              className="dd2-btn dd2-btn--ghost"
              disabled={running}
              onClick={() => {
                openReviewAfterDirectorBatch({
                  deskBlockId: blockId,
                  nodes: nodes as never,
                  edges: edges as never,
                  updateNodeData,
                  shots: reviewShots,
                  episodeId,
                  sourceChainDeskId,
                  openSession: true,
                });
                appendLog('导演台 · 已打开宫格外审');
              }}
            >
              打开宫格审阅
            </button>
          </div>
        </div>

         {reviewStats.missing > 0 ? (
           <button type="button" className="dd2-review__hint is-warn dd2-review__hint-btn" onClick={onGoToMissing}>
             还有 {reviewStats.missing} 镜缺关键帧，请点此回「选镜批出」补齐。
           </button>
        ) : keyframeGatePassed ? (
          <p className="dd2-review__hint is-ok">本集关键帧已全部批准，可推送视频生成。</p>
        ) : (
          <p className="dd2-review__hint">逐镜批准或一键全部通过；打回后可在生产 Tab 重出。</p>
        )}

        <div className="dd2-review__board">
          {sortedShots.length === 0 ? (
            <p className="dd2-review__empty">暂无镜头</p>
          ) : (
            sortedShots.map((shot) => {
              const approved = isShotKeyframeApproved(shot as never);
              const missing = isShotMissingKeyframe(shot as never);
              const failed = isShotKeyframeFailed(shot as never);
              const editing = rejectEditingId === shot.id;
              const busy = rejectBusyId === shot.id;
              return (
                <article
                  key={shot.id}
                  className={`dd2-review__cell ${approved ? 'is-ok' : ''} ${missing ? 'is-miss' : ''} ${failed ? 'is-fail' : ''}`}
                >
                  <button
                    type="button"
                    className="dd2-review__thumb"
                    onClick={() => {
                      focusShot(shot.id);
                      if (shot.firstFrameAssetId) {
                        updateNodeData(blockId, { previewUrl: shot.firstFrameAssetId });
                      }
                    }}
                  >
                    {shot.firstFrameAssetId ? (
                      <img src={shot.firstFrameAssetId} alt="" draggable={false} />
                    ) : (
                      <span>缺图</span>
                    )}
                  </button>
                  <div className="dd2-review__meta">
                    <strong>#{shot.index}</strong>
                    <em>
                      {approved ? '已过' : missing ? '缺图' : failed ? '已打回' : '待审'}
                      {' · '}
                      {shot.durationSec}s
                    </em>
                  </div>
                   {!missing && !approved ? (
                    <div className="dd2-review__cell-acts">
                      <button
                        type="button"
                        className="dd2-btn dd2-btn--ghost"
                        disabled={running || busy}
                        onClick={() => handleApproveShot(shot.id)}
                      >
                        批准
                      </button>
                      <button
                        type="button"
                        className="dd2-btn dd2-btn--ghost"
                        disabled={running || busy}
                        onClick={() => setRejectEditingId(editing ? null : shot.id)}
                      >
                        打回
                      </button>
                    </div>
                   ) : approved ? (
                     <div className="dd2-review__cell-acts">
                       <button type="button" className="dd2-btn dd2-btn--ghost" disabled={running || busy} onClick={() => handleUnapproveShot(shot.id)}>撤回</button>
                     </div>
                   ) : null}
                   {editing ? (
                     <div className="dd2-review__reject">
                       <div className="dd2-review__chips" aria-label="快捷打回原因">
                         {['构图偏了', '角色不像', '光线不对', '需要重做'].map((label) => (
                           <button
                             key={label}
                             type="button"
                             className="dd2-btn dd2-btn--ghost"
                             onClick={() => setRejectDrafts((prev) => {
                               const current = prev[shot.id] ?? shot.keyframeReviewNote ?? '';
                               const next = current.trim();
                               return { ...prev, [shot.id]: next ? `${next}；${label}` : label };
                             })}
                           >
                             {label}
                           </button>
                         ))}
                       </div>
                       <textarea
                        rows={2}
                        placeholder="打回原因（必填）"
                        value={rejectDrafts[shot.id] ?? shot.keyframeReviewNote ?? ''}
                        onChange={(e) =>
                          setRejectDrafts((prev) => ({ ...prev, [shot.id]: e.target.value }))
                        }
                      />
                      <div className="dd2-review__reject-acts">
                        <button
                          type="button"
                          className="dd2-btn dd2-btn--ghost"
                          disabled={busy}
                          onClick={() => void handleRejectShot(shot.id, false)}
                        >
                          仅打回
                        </button>
                        <button
                          type="button"
                          className="dd2-btn dd2-btn--primary"
                          disabled={busy}
                          onClick={() => void handleRejectShot(shot.id, true)}
                        >
                          {busy ? '处理中…' : '打回并重出'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!editing && shot.keyframeReviewNote ? (
                    <p className="dd2-review__note">{shot.keyframeReviewNote}</p>
                  ) : null}
                  {!editing && shot.keyframePreviousUrl ? (
                    <button type="button" className="dd2-btn dd2-btn--ghost" disabled={running || busy} onClick={() => handleRestoreShot(shot.id)}>恢复上一版</button>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>

      <div className="dd2-deliver__grid">
        <div className="dd2-deliver__card">
          <span className="dd2-deliver__card-title">同步风格到出图</span>
          <p className="dd2-deliver__card-desc">把当前风格 prompt / seed 写回下游图像生成节点</p>
          <button
            type="button"
            className="dd2-btn dd2-btn--ghost dd2-deliver__card-btn"
            disabled={running || !pictureNode}
            onClick={() => {
              syncStyleToPictureGen({
                deskBlockId: blockId,
                nodes: nodes as never,
                edges: edges as never,
                updateNodeData,
                styleSeed,
                stylePrompt,
              });
              appendLog('风格已同步出图节点');
            }}
          >
            写回风格
          </button>
        </div>
        <div className={`dd2-deliver__card is-primary ${keyframeGatePassed ? '' : 'is-locked'}`}>
          <span className="dd2-deliver__card-title">推送到视频生成</span>
          <p className="dd2-deliver__card-desc">
            {keyframeGatePassed
              ? '本集关键帧已批准，写入 clip-gen 进入视频主链'
              : '需本集关键帧全部批准后放行；紧急时可强制推送'}
          </p>
          <div className="dd2-deliver__card-row">
            <button
              type="button"
              className="dd2-btn dd2-btn--primary dd2-deliver__card-btn"
              disabled={running || !clipNode || stats.withFrame === 0 || !keyframeGatePassed}
              onClick={() => handlePushClipGen(false)}
            >
              推送关键帧
            </button>
            {!keyframeGatePassed && clipNode && stats.withFrame > 0 ? (
              <button
                type="button"
                className="dd2-btn dd2-btn--ghost dd2-deliver__card-btn"
                disabled={running}
                onClick={() => handlePushClipGen(true)}
              >
                强制推送
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="dd2-deliver__summary">
        {pictureNode
          ? `出图：${(pictureNode.data as Record<string, unknown>)?.model ?? '默认'}`
          : '出图：默认 Gemini 2.5 Flash Image'}
        {clipNode ? ' · 可送视频' : ' · 未接 clip-gen'}
        {' · '}已出 {stats.withFrame}/{stats.total}
        {' · '}
        {keyframeGatePassed ? '审阅已放行' : `审阅未放行（待 ${reviewStats.pending + reviewStats.failed + reviewStats.missing}）`}
      </div>
      {clipBatchLabel || lastPushReceipt?.at ? (
        <div className="dd2-push-receipt">
          {clipBatchLabel
            ?? `已写入 clip-gen · ${lastPushReceipt?.shotCount ?? 0} 镜`}
          {lastPushReceipt?.at ? ` · ${new Date(lastPushReceipt.at).toLocaleString()}` : ''}
        </div>
      ) : null}
    </div>
  );
}
