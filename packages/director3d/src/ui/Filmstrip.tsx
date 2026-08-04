import type { Director3dCandidate } from '../schema/directorProject';

export function Filmstrip({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates?: Director3dCandidate[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const frames = candidates ?? [];

  if (frames.length === 0) {
    return (
      <div className="nx9-stage-filmstrip">
        <span className="nx9-stage-filmstrip-label">帧</span>
        <span className="nx9-stage-hint">点击「记录帧」创建候选帧，再选择并提交</span>
      </div>
    );
  }

  return (
    <div className="nx9-stage-filmstrip">
      <span className="nx9-stage-filmstrip-label">帧</span>
      {frames.map((cap, i) => (
        <button
          key={cap.id}
          type="button"
          className={`nx9-stage-frame${selectedId === cap.id ? ' is-selected' : ''}`}
          onClick={() => onSelect?.(cap.id)}
          title={cap.prompt}
        >
          <img
            src={cap.imageUrl ?? cap.localDataUrl}
            alt={`候选帧 ${i + 1}`}
            className={`nx9-stage-frame-thumb${i === frames.length - 1 ? ' is-latest' : ''}`}
          />
          <span>{cap.status === 'committed' ? '已提交' : cap.status === 'failed' ? '失败' : selectedId === cap.id ? '已采用' : '候选'}</span>
        </button>
      ))}
    </div>
  );
}
