import { Box, Globe2, Image as ImageIcon, Play, RefreshCw } from 'lucide-react';
import { normalizeDirectorProject } from '@nx9/director3d';
import type {
  StoryboardPreviewFrame,
  StoryboardPreviewPanorama720,
} from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardPreviewDirector3dPanelProps {
  frames: StoryboardPreviewFrame[];
  selectedFrameId?: string | null;
  panorama?: StoryboardPreviewPanorama720 | null;
  panoramaPrompt: string;
  directorData?: Record<string, unknown>;
  pictureConnected: boolean;
  directorConnected: boolean;
  generatingPanorama: boolean;
  onSelectFrame: (frameId: string | null) => void;
  onPanoramaPromptChange: (prompt: string) => void;
  onGeneratePanorama: () => void;
  onLoadPanorama: () => void;
  onOpenDirector3d: () => void;
}

/** 分镜预览内的 3D 调度区：环境生成、选帧、摆位入口与机位结果集中在这里。 */
export function StoryboardPreviewDirector3dPanel({
  frames,
  selectedFrameId,
  panorama,
  panoramaPrompt,
  directorData,
  pictureConnected,
  directorConnected,
  generatingPanorama,
  onSelectFrame,
  onPanoramaPromptChange,
  onGeneratePanorama,
  onLoadPanorama,
  onOpenDirector3d,
}: StoryboardPreviewDirector3dPanelProps) {
  const project = normalizeDirectorProject(directorData?.scene);
  const selectedFrame = frames.find((frame) => frame.id === selectedFrameId);
  const latestCapture =
    selectedFrame?.director3dGuide?.captureUrl ??
    (directorData?.lastCaptureUrl as string | undefined);
  const panoramaLoaded = Boolean(
    panorama?.imageUrl && project.panorama?.url === panorama.imageUrl,
  );
  const characterCount = project.objects.filter((object) => object.kind === 'character').length;
  const requiredCharacterCount = Math.max(
    selectedFrame?.characterIds?.length ?? 0,
    selectedFrame?.characterNames?.length ?? 0,
  );
  const savedPlacementCount = selectedFrame?.director3dGuide?.characterPlacements?.length ?? 0;

  return (
    <div className="kp__panel nodrag nopan" onMouseDown={stop}>
      <div className="kp__panel-head">
        <div className="kp__panel-icon">
          <Box size={15} />
        </div>
        <div className="min-w-0">
          <p className="kp__panel-title">3D 导演</p>
          <p className="kp__panel-sub">全景环境 → 人物摆位 → 机位快照 → 正式出图</p>
        </div>
        <span className={`kp__panel-badge ${directorConnected ? 'is-ok' : 'is-warn'}`}>
          {directorConnected ? '3D 已就绪' : '请连接 3D 导演台'}
        </span>
      </div>

      <label className="kp__row">
        <span className="kp__row-label">工作分镜</span>
        <select
          value={selectedFrameId ?? ''}
          onChange={(event) => onSelectFrame(event.target.value || null)}
          className="kp__field-select"
        >
          <option value="">仅搭建场景，不绑定分镜</option>
          {[...frames]
            .sort((a, b) => a.order - b.order)
            .map((frame) => (
              <option key={frame.id} value={frame.id} disabled={frame.locked}>
                {frame.label} · {frame.startSec.toFixed(1).replace(/\.0$/, '')}–{frame.endSec.toFixed(1).replace(/\.0$/, '')}s
                {frame.director3dGuide ? ' · 已有机位' : ''}
                {frame.locked ? ' · 已锁定' : ''}
              </option>
            ))}
        </select>
      </label>

      <div className="kp__card is-sky">
        <div className="kp__card-head">
          <Globe2 size={13} />
          <p className="kp__panel-title" style={{ fontSize: 11 }}>720° 全景环境</p>
          <span>标准 360×180 · 2:1</span>
          {panoramaLoaded && (
            <span className="kp__panel-badge is-ok" style={{ marginLeft: 'auto' }}>
              已加载到 3D
            </span>
          )}
        </div>
        <div className="kp__card-body">
          {panorama?.imageUrl && (
            <div className="kp__media is-pano">
              <img src={panorama.imageUrl} alt="720° 全景环境" />
            </div>
          )}
          <textarea
            value={panoramaPrompt}
            onChange={(event) => onPanoramaPromptChange(event.target.value)}
            placeholder="描述场景空间、时间、天气、材质和光线；人物将稍后在 3D 中放置…"
            rows={2}
            className="kp__field-area"
          />
          <div className="kp__row">
            <p className="kp__hint">
              全景图只生成环境，不生成人物，避免人物被烘焙进背景。
            </p>
            {panorama?.imageUrl && (
              <button
                type="button"
                disabled={!directorConnected || panoramaLoaded}
                onClick={onLoadPanorama}
                className="kp__btn"
              >
                {panoramaLoaded ? '已加载' : '加载到 3D'}
              </button>
            )}
            <button
              type="button"
              disabled={!pictureConnected || generatingPanorama || !panoramaPrompt.trim()}
              onClick={onGeneratePanorama}
              className="kp__btn is-sky"
            >
              {generatingPanorama ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Globe2 size={11} />
              )}
              {panorama ? '重新生成全景' : '生成全景'}
            </button>
          </div>
        </div>
      </div>

      <div className="kp__card is-violet">
        <div className="kp__card-body">
          <div className="kp__row" style={{ alignItems: 'stretch' }}>
            <div className="kp__media is-shot">
              {latestCapture ? (
                <img src={latestCapture} alt="3D 机位快照" />
              ) : (
                <div className="kp__media-empty">
                  <ImageIcon size={20} />
                </div>
              )}
            </div>
            <div className="min-w-0" style={{ flex: 1 }}>
              <p className="kp__panel-title">实时摆位与机位</p>
              <p className="kp__hint" style={{ marginTop: 6 }}>
                本镜 {requiredCharacterCount} 人 · 场景已有 {characterCount} 人 · {project.cameras.length} 个机位
                {savedPlacementCount > 0 ? ` · 已保存 ${savedPlacementCount} 人摆位` : ''}
              </p>
              <p className="kp__hint" style={{ marginTop: 4 }}>
                {selectedFrame?.director3dGuide?.cameraPrompt ??
                  '进入舞台后放置人物、调整姿态和机位，记录帧会自动写回当前分镜。'}
              </p>
            </div>
          </div>
          <div className="kp__editor-actions">
            <button
              type="button"
              disabled={!directorConnected || Boolean(selectedFrame?.locked)}
              onClick={onOpenDirector3d}
              className="kp__btn is-violet"
            >
              <Play size={11} fill="currentColor" />
              {selectedFrame ? `带入人物并摆位 ${selectedFrame.label}` : '打开 3D 场景'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
