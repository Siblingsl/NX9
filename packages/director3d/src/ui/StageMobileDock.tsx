import { useDirectorStore, type StageMobileSheet } from '../store/directorStore';

const DOCK: { id: StageMobileSheet; label: string }[] = [
  { id: 'shots', label: '镜头' },
  { id: 'rig', label: '机位' },
  { id: 'move', label: '运镜' },
  { id: 'layers', label: '层' },
  { id: 'add', label: '添加' },
  { id: 'light', label: '灯光' },
  { id: 'env', label: '环境' },
  { id: 'film', label: '候选' },
];

export function StageMobileDock({
  onCapture,
  capturing,
  canCommit,
  onCommit,
  committing,
}: {
  onCapture: () => void;
  capturing?: boolean;
  canCommit?: boolean;
  onCommit?: () => void;
  committing?: boolean;
}) {
  const sheet = useDirectorStore((s) => s.mobileSheet);
  const setMobileSheet = useDirectorStore((s) => s.setMobileSheet);
  const interactionMode = useDirectorStore((s) => s.interactionMode);
  const setInteractionMode = useDirectorStore((s) => s.setInteractionMode);
  const viewportLayout = useDirectorStore((s) => s.viewportLayout);
  const setViewportLayout = useDirectorStore((s) => s.setViewportLayout);

  return (
    <nav className="nx9-stage-mobile-dock" aria-label="移动端舞台底栏">
      <div className="nx9-stage-mobile-dock__modes">
        {(['navigate', 'subject', 'camera'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`nx9-stage-pill${interactionMode === mode ? ' is-on' : ''}`}
            onClick={() => setInteractionMode(mode)}
          >
            {mode === 'navigate' ? '导航' : mode === 'subject' ? '主体' : '机位'}
          </button>
        ))}
        <button
          type="button"
          className={`nx9-stage-pill${viewportLayout === 'quad' ? ' is-on' : ''}`}
          onClick={() => setViewportLayout(viewportLayout === 'quad' ? 'single' : 'quad')}
        >
          {viewportLayout === 'quad' ? '四视' : '单视'}
        </button>
      </div>
      <div className="nx9-stage-mobile-dock__sheets">
        {DOCK.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nx9-stage-mobile-dock__btn${sheet === item.id ? ' is-on' : ''}`}
            onClick={() => setMobileSheet(sheet === item.id ? null : item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="nx9-stage-mobile-dock__actions">
        <button type="button" className="nx9-stage-cta" disabled={capturing} onClick={onCapture}>
          {capturing ? '记录中…' : '记录'}
        </button>
        {onCommit && (
          <button type="button" className="nx9-stage-pill" disabled={!canCommit || committing} onClick={onCommit}>
            提交
          </button>
        )}
      </div>
    </nav>
  );
}
