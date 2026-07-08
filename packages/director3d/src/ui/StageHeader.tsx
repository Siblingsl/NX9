import { useDirectorStore } from '../store/directorStore';
import type { ViewportAspectRatio } from '../schema/directorProject';

const ASPECTS: ViewportAspectRatio[] = ['16:9', '9:16', '1:1'];

export function StageHeader({
  linkedShotId,
  performanceLow,
  capturing,
  onCapture,
  onClose,
}: {
  linkedShotId?: string;
  performanceLow?: boolean;
  capturing?: boolean;
  onCapture: () => void;
  onClose?: () => void;
}) {
  const viewMode = useDirectorStore((s) => s.viewMode);
  const aspect = useDirectorStore((s) => s.project.viewportAspectRatio);
  const canUndo = useDirectorStore((s) => s.undoStack.length > 0);
  const setViewMode = useDirectorStore((s) => s.setViewMode);
  const setAspect = useDirectorStore((s) => s.setViewportAspectRatio);
  const undo = useDirectorStore((s) => s.undo);

  return (
    <header className="nx9-stage-header">
      <div className="nx9-stage-mark">SD</div>
      <div>
        <div className="nx9-stage-title">Stage Deck</div>
        <div className="nx9-stage-sub">
          NX9 预演工作台
          {linkedShotId ? ' · 已关联镜头' : ''}
          {performanceLow ? ' · 性能模式' : ''}
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: 'var(--stage-line)', margin: '0 4px' }} />

      <button
        type="button"
        className={`nx9-stage-pill${viewMode === 'director' ? ' is-on' : ''}`}
        onClick={() => setViewMode('director')}
      >
        俯瞰
      </button>
      <button
        type="button"
        className={`nx9-stage-pill${viewMode === 'camera' ? ' is-on' : ''}`}
        onClick={() => setViewMode('camera')}
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

      <button
        type="button"
        className="nx9-stage-pill"
        disabled={!canUndo}
        onClick={undo}
        title="撤销 (Ctrl+Z)"
      >
        撤销
      </button>

      <button type="button" className="nx9-stage-cta" disabled={capturing} onClick={onCapture}>
        {capturing ? '记录中…' : '记录帧'}
      </button>
      {onClose && (
        <button type="button" className="nx9-stage-pill" onClick={onClose}>
          关闭
        </button>
      )}
    </header>
  );
}
