import { Clapperboard, Play, RotateCcw, Square, Box } from 'lucide-react';
import { DirectorSettingsDrawer } from './director-settings-drawer';
import { useConnectedPictureModels } from '../../../hooks/use-connected-picture-models';

interface DirectorMainPanelProps {
  previewUrl: string | undefined;
  lineArtUrl: string | undefined;
  guideUrl: string | undefined;
  currentShotIndex: string;
  currentShotDesc: string | undefined;
  previewMode: 'keyframe' | 'lineart' | 'guide3d' | 'compare';
  setPreviewMode: (v: 'keyframe' | 'lineart' | 'guide3d' | 'compare') => void;
  setStudioTab: (v: 'produce' | 'stage3d' | 'deliver') => void;
  director3dEnabled: boolean;
  showSettings: boolean;
  setShowSettings: (v: boolean | ((prev: boolean) => boolean)) => void;
  batchError: string | undefined;
  running: boolean;
  stats: { total: number; failed: number };
  filter: string;
  selectedIds: Set<string>;
  runBatch: (mode: 'filter' | 'selected' | 'one' | 'failed', oneId?: string) => Promise<void>;
  stopBatch: () => void;
  primaryLabel: string;
  skipExisting: boolean;
  skipApproved: boolean;
  forceCharacterRef: boolean;
  forceSceneRef: boolean;
  styleLock: boolean;
  prefer3dRef: boolean;
  preferLineArtRef: boolean;
  concurrency: number;
  maxRetries: number;
  stylePrompt: string;
  styleSeed: number | null;
  syncStyleToPicture: boolean;
  autoOpenReview: boolean;
  globalArtDirection: unknown;
  blockId: string;
  pictureGenId: string | undefined;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  syncStyleNow: () => void;
  pictureNodeData: Record<string, unknown>;
  pictureConnected: boolean;
  referenceGaps: Array<{ shotId: string; index: number; missingForced: string[] }>;
  reviewMode: 'manual' | 'auto';
  batchSummary?: { done?: number; failed?: number; skipped?: number };
  lastResults: Array<{ shotId: string; index?: number; ok?: boolean; error?: string }>;
  focusShot: (shotId: string) => void;
}

export function DirectorMainPanel({
  previewUrl,
  lineArtUrl,
  guideUrl,
  currentShotIndex,
  currentShotDesc,
  previewMode,
  setPreviewMode,
  setStudioTab,
  director3dEnabled,
  showSettings,
  setShowSettings,
  batchError,
  running,
  stats,
  filter,
  selectedIds,
  runBatch,
  stopBatch,
  primaryLabel,
  skipExisting,
  skipApproved,
  forceCharacterRef,
  forceSceneRef,
  styleLock,
  prefer3dRef,
  preferLineArtRef,
  concurrency,
  maxRetries,
  stylePrompt,
  styleSeed,
  syncStyleToPicture,
  autoOpenReview,
  globalArtDirection,
  blockId,
  pictureGenId,
  updateNodeData,
  syncStyleNow,
  pictureNodeData,
  pictureConnected,
  referenceGaps,
  reviewMode,
  batchSummary,
  lastResults,
  focusShot,
}: DirectorMainPanelProps) {
  const pictureModel = typeof pictureNodeData.model === 'string' ? pictureNodeData.model : '';
  const pictureSize = typeof pictureNodeData.size === 'string' ? pictureNodeData.size : '1024x1024';
  const { options, selectModel } = useConnectedPictureModels(pictureModel);
  return (
    <div className="dd2-cinema">
      <div className="dd2-cinema__screen">
        <div className="dd2-cinema__toolbar">
          <div className="dd2-cinema__modes" role="tablist">
            <button type="button" className={previewMode === 'keyframe' ? 'is-on' : ''} onClick={() => setPreviewMode('keyframe')}>关键帧</button>
            <button type="button" className={previewMode === 'lineart' ? 'is-on' : ''} onClick={() => setPreviewMode('lineart')}>线稿</button>
            <button type="button" className={previewMode === 'guide3d' ? 'is-on' : ''} onClick={() => setPreviewMode('guide3d')}>3D 参考</button>
            <button type="button" className={previewMode === 'compare' ? 'is-on' : ''} onClick={() => setPreviewMode('compare')}>对比</button>
          </div>
          <span className="dd2-cinema__shot">
            当前镜 #{currentShotIndex}{currentShotDesc ? ` · ${String(currentShotDesc).slice(0, 28)}` : ''}
            {' · '}
            <button type="button" className="dd2-review-mode" onClick={() => updateNodeData(blockId, { reviewMode: reviewMode === 'manual' ? 'auto' : 'manual' })}>
              审阅：{reviewMode === 'manual' ? '手动' : '生成即通过'}
            </button>
          </span>
        </div>

        <div className={`dd2-cinema__viewport ${previewMode === 'compare' ? 'is-compare' : ''}`}>
          {previewMode === 'keyframe' && (previewUrl ? (
            <img src={previewUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Clapperboard size={28} strokeWidth={1.25} />
              <strong>等待关键帧</strong>
              <span>选左侧胶片镜号，再批出本集</span>
            </div>
          ))}
          {previewMode === 'lineart' && (lineArtUrl ? (
            <img src={lineArtUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Clapperboard size={28} strokeWidth={1.25} />
              <strong>无上游线稿</strong>
              <span>请先从分镜台确认并交接线稿</span>
            </div>
          ))}
          {previewMode === 'guide3d' && (guideUrl ? (
            <img src={guideUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Box size={28} strokeWidth={1.25} />
              <strong>无 3D 参考</strong>
              <span>可切到「3D 舞台」摆机位后截图</span>
               <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setStudioTab('stage3d')} disabled={!director3dEnabled} title={director3dEnabled ? undefined : '3D 导演台暂未开放'}>3D 舞台暂未开放</button>
            </div>
          ))}
          {previewMode === 'compare' && (
            <>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">线稿</span>
                {lineArtUrl ? <img src={lineArtUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无线稿</div>}
              </div>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">关键帧</span>
                {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无关键帧</div>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dd2-cinema__dock">
        <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setShowSettings((v) => !v)}>
          批出设置{showSettings ? ' ▴' : ''}
        </button>
        <button
          type="button"
          className="dd2-btn dd2-btn--ghost"
          onClick={() => setStudioTab('stage3d')}
          disabled={!director3dEnabled}
          title={director3dEnabled ? undefined : '3D 导演台暂未开放'}
        >
          <Box size={13} /> 3D 机位暂未开放
        </button>
        {!running && stats.failed > 0 && (
          <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => void runBatch('failed')}>
            <RotateCcw size={12} /> 重试失败
          </button>
        )}
        {!running && selectedIds.size > 0 && (
          <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => void runBatch('selected')}>
            <Play size={13} /> 批出选中（{selectedIds.size}）
          </button>
        )}
        {running && (
          <button type="button" className="dd2-btn dd2-btn--ghost dd2-btn--warn" onClick={stopBatch}>
            <Square size={12} /> 停止
          </button>
        )}
        <button
          type="button"
          className="dd2-btn dd2-btn--primary dd2-btn--batch"
          disabled={running || stats.total === 0 || (referenceGaps.length > 0 && (forceCharacterRef || forceSceneRef))}
          onClick={() => void runBatch(filter === 'selected' ? 'selected' : 'filter')}
        >
          <Play size={13} /> {primaryLabel}
        </button>
      </div>

      {referenceGaps.length > 0 ? (
        <div className="dd2-reference-gaps" role="status">
          <strong>本次入队参考缺失</strong>
          {referenceGaps.map((gap) => (
            <button key={gap.shotId} type="button" onClick={() => focusShot(gap.shotId)}>
              #{gap.index} · {gap.missingForced.join('、')}
            </button>
          ))}
          {(forceCharacterRef || forceSceneRef) && <small>参考锁开启，补齐后才能批出。</small>}
        </div>
      ) : null}

      {batchSummary && (batchSummary.done || batchSummary.failed || batchSummary.skipped) ? (
        <div className="dd2-batch-summary" role="status">
          完成：成功 {batchSummary.done ?? 0} · 失败 {batchSummary.failed ?? 0} · 跳过 {batchSummary.skipped ?? 0}
          {lastResults.some((result) => result.ok === false) ? (
            <span>
              {' '}失败镜{' '}
              {lastResults.filter((result) => result.ok === false).map((result) => (
                <button key={result.shotId} type="button" onClick={() => focusShot(result.shotId)}>#{result.index ?? '?'}</button>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="dd2-output-strip" aria-label="出图参数">
        <span>出图参数</span>
        <select
          value={pictureModel}
          disabled={!pictureConnected || options.length === 0}
           onChange={(e) => void selectModel(e.target.value, (model) => {
             if (pictureGenId) updateNodeData(pictureGenId, { model });
           })}
        >
          {options.length === 0 ? <option value={pictureModel}>{pictureModel || '未连接模型'}</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <select
          value={pictureSize}
          disabled={!pictureConnected}
           onChange={(e) => {
             if (pictureGenId) updateNodeData(pictureGenId, { size: e.target.value });
           }}
        >
          {['1024x1024', '1536x1024', '1024x1536'].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <small>{pictureConnected ? '来自已连接图像生成' : '请连接图像生成节点'}</small>
      </div>

      {batchError && <p className="dd2-cinema__error">{batchError}</p>}

      <DirectorSettingsDrawer
        showSettings={showSettings}
        skipExisting={skipExisting}
        skipApproved={skipApproved}
        forceCharacterRef={forceCharacterRef}
        forceSceneRef={forceSceneRef}
        styleLock={styleLock}
        prefer3dRef={prefer3dRef}
        preferLineArtRef={preferLineArtRef}
        concurrency={concurrency}
        maxRetries={maxRetries}
        stylePrompt={stylePrompt}
        styleSeed={styleSeed}
        syncStyleToPicture={syncStyleToPicture}
        autoOpenReview={autoOpenReview}
        globalArtDirection={globalArtDirection}
        blockId={blockId}
        updateNodeData={updateNodeData}
        syncStyleNow={syncStyleNow}
        setShowSettings={setShowSettings}
      />
    </div>
  );
}
