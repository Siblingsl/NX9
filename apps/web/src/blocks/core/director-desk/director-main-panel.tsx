import { Clapperboard, Play, RotateCcw, Square, Box } from 'lucide-react';
import { DirectorSettingsDrawer } from './director-settings-drawer';

interface DirectorMainPanelProps {
  previewUrl: string | undefined;
  guideUrl: string | undefined;
  currentShotIndex: string;
  currentShotDesc: string | undefined;
  previewMode: 'keyframe' | 'guide3d' | 'compare';
  setPreviewMode: (v: 'keyframe' | 'guide3d' | 'compare') => void;
  setStudioTab: (v: 'produce' | 'stage3d' | 'deliver') => void;
  showSettings: boolean;
  setShowSettings: (v: boolean | ((prev: boolean) => boolean)) => void;
  batchError: string | undefined;
  running: boolean;
  stats: { total: number; failed: number };
  filter: string;
  runBatch: (mode: 'filter' | 'selected' | 'one' | 'failed', oneId?: string) => Promise<void>;
  stopBatch: () => void;
  primaryLabel: string;
  skipExisting: boolean;
  skipApproved: boolean;
  forceCharacterRef: boolean;
  forceSceneRef: boolean;
  styleLock: boolean;
  prefer3dRef: boolean;
  concurrency: number;
  maxRetries: number;
  stylePrompt: string;
  styleSeed: number | null;
  syncStyleToPicture: boolean;
  autoOpenReview: boolean;
  globalArtDirection: unknown;
  blockId: string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  syncStyleNow: () => void;
}

export function DirectorMainPanel({
  previewUrl,
  guideUrl,
  currentShotIndex,
  currentShotDesc,
  previewMode,
  setPreviewMode,
  setStudioTab,
  showSettings,
  setShowSettings,
  batchError,
  running,
  stats,
  filter,
  runBatch,
  stopBatch,
  primaryLabel,
  skipExisting,
  skipApproved,
  forceCharacterRef,
  forceSceneRef,
  styleLock,
  prefer3dRef,
  concurrency,
  maxRetries,
  stylePrompt,
  styleSeed,
  syncStyleToPicture,
  autoOpenReview,
  globalArtDirection,
  blockId,
  updateNodeData,
  syncStyleNow,
}: DirectorMainPanelProps) {
  return (
    <div className="dd2-cinema">
      <div className="dd2-cinema__screen">
        <div className="dd2-cinema__toolbar">
          <div className="dd2-cinema__modes" role="tablist">
            <button type="button" className={previewMode === 'keyframe' ? 'is-on' : ''} onClick={() => setPreviewMode('keyframe')}>关键帧</button>
            <button type="button" className={previewMode === 'guide3d' ? 'is-on' : ''} onClick={() => setPreviewMode('guide3d')}>3D 参考</button>
            <button type="button" className={previewMode === 'compare' ? 'is-on' : ''} onClick={() => setPreviewMode('compare')}>对比</button>
          </div>
          <span className="dd2-cinema__shot">
            当前镜 #{currentShotIndex}{currentShotDesc ? ` · ${String(currentShotDesc).slice(0, 28)}` : ''}
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
          {previewMode === 'guide3d' && (guideUrl ? (
            <img src={guideUrl} alt="" draggable={false} />
          ) : (
            <div className="dd2-cinema__empty">
              <Box size={28} strokeWidth={1.25} />
              <strong>无 3D 参考</strong>
              <span>可切到「3D 舞台」摆机位后截图</span>
              <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => setStudioTab('stage3d')}>进入 3D 舞台</button>
            </div>
          ))}
          {previewMode === 'compare' && (
            <>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">关键帧</span>
                {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无关键帧</div>}
              </div>
              <div className="dd2-cinema__pane">
                <span className="dd2-cinema__pane-label">3D</span>
                {guideUrl ? <img src={guideUrl} alt="" draggable={false} /> : <div className="dd2-cinema__empty is-mini">无 3D</div>}
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
        >
          <Box size={13} /> 摆 3D 机位
        </button>
        {!running && stats.failed > 0 && (
          <button type="button" className="dd2-btn dd2-btn--ghost" onClick={() => void runBatch('failed')}>
            <RotateCcw size={12} /> 重试失败
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
          disabled={running || stats.total === 0}
          onClick={() => void runBatch(filter === 'selected' ? 'selected' : 'filter')}
        >
          <Play size={13} /> {primaryLabel}
        </button>
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
