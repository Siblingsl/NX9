import { useDirectorStore } from '../store/directorStore';
import type { ViewMode, ViewportAspectRatio } from '../schema/directorProject';
import type { StageInteractionMode, StageViewportLayout } from '../store/directorStore';

const ASPECTS: ViewportAspectRatio[] = ['16:9', '9:16', '1:1'];
const MODES: { id: StageInteractionMode; label: string; tip: string }[] = [
  { id: 'navigate', label: '导航', tip: 'WASD 飞摄' },
  { id: 'subject', label: '主体', tip: '摆演员/道具' },
  { id: 'camera', label: '机位', tip: '看镜头画面' },
];

export function StageHeader({
  linkedShotId,
  performanceLow,
  capturing,
  onCapture,
  onClose,
  viewModeOverride,
  onViewModeChange,
}: {
  linkedShotId?: string;
  performanceLow?: boolean;
  capturing?: boolean;
  onCapture: () => void;
  onClose?: () => void;
  viewModeOverride?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}) {
  const storeViewMode = useDirectorStore((s) => s.viewMode);
  const viewMode = viewModeOverride ?? storeViewMode;
  const aspect = useDirectorStore((s) => s.project.viewportAspectRatio);
  const canUndo = useDirectorStore((s) => s.undoStack.length > 0);
  const setViewMode = useDirectorStore((s) => s.setViewMode);
  const setAspect = useDirectorStore((s) => s.setViewportAspectRatio);
  const undo = useDirectorStore((s) => s.undo);
  const interactionMode = useDirectorStore((s) => s.interactionMode);
  const setInteractionMode = useDirectorStore((s) => s.setInteractionMode);
  const viewportLayout = useDirectorStore((s) => s.viewportLayout);
  const setViewportLayout = useDirectorStore((s) => s.setViewportLayout);
  const frameSelection = useDirectorStore((s) => s.frameSelection);

  return (
    <header className="nx9-stage-header">
      <div className="nx9-stage-mark">3D</div>
      <div>
        <div className="nx9-stage-title">Stage Composer</div>
        <div className="nx9-stage-sub">
          摆镜 · 运镜 · 截帧
          {linkedShotId ? ' · 已关联镜头' : ' · 独立场景'}
          {performanceLow ? ' · 性能模式' : ''}
        </div>
      </div>

      <div className="nx9-stage-mode-group" role="group" aria-label="交互模式">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.tip}
            className={`nx9-stage-pill${interactionMode === m.id ? ' is-on' : ''}`}
            onClick={() => {
              setInteractionMode(m.id);
              if (m.id === 'camera') {
                setViewMode('camera');
                onViewModeChange?.('camera');
              } else if (m.id === 'navigate') {
                setViewMode('director');
                onViewModeChange?.('director');
              }
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`nx9-stage-pill${viewportLayout === 'quad' ? ' is-on' : ''}`}
        onClick={() => setViewportLayout((viewportLayout === 'quad' ? 'single' : 'quad') as StageViewportLayout)}
        title="四视口 / 单视口"
      >
        {viewportLayout === 'quad' ? '四视口' : '单视口'}
      </button>

      <button
        type="button"
        className={`nx9-stage-pill${viewMode === 'director' ? ' is-on' : ''}`}
        onClick={() => {
          setViewMode('director');
          onViewModeChange?.('director');
        }}
      >
        俯瞰
      </button>
      <button
        type="button"
        className={`nx9-stage-pill${viewMode === 'camera' ? ' is-on' : ''}`}
        onClick={() => {
          setViewMode('camera');
          onViewModeChange?.('camera');
          setInteractionMode('camera');
        }}
      >
        镜头
      </button>

      <select
        className="nx9-stage-pill"
        value={aspect}
        onChange={(e) => setAspect(e.target.value as ViewportAspectRatio)}
        style={{ cursor: 'pointer' }}
      >
        {ASPECTS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <div style={{ flex: 1 }} />

      <button type="button" className="nx9-stage-pill" onClick={frameSelection} title="框选主体 (F)">
        框选
      </button>
      <button type="button" className="nx9-stage-pill" disabled={!canUndo} onClick={undo} title="撤销 (Ctrl+Z)">
        撤销
      </button>
      <button type="button" className="nx9-stage-cta" disabled={capturing} onClick={onCapture}>
        {capturing ? '记录中…' : '记录候选帧'}
      </button>
      {onClose && (
        <button type="button" className="nx9-stage-pill" onClick={onClose}>
          关闭
        </button>
      )}
    </header>
  );
}
