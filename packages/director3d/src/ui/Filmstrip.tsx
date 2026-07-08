import { useDirectorStore } from '../store/directorStore';

export function Filmstrip() {
  const project = useDirectorStore((s) => s.project);
  const active = project.cameras.find((c) => c.id === project.activeCameraId);
  const frames = active?.captures ?? [];

  if (frames.length === 0) {
    return (
      <div className="nx9-stage-filmstrip">
        <span className="nx9-stage-filmstrip-label">帧</span>
        <span className="nx9-stage-hint">点击「记录帧」保存当前镜头画面</span>
      </div>
    );
  }

  return (
    <div className="nx9-stage-filmstrip">
      <span className="nx9-stage-filmstrip-label">帧</span>
      {frames.map((cap, i) => (
        <img
          key={cap.id}
          src={cap.imageUrl ?? cap.dataUrl}
          alt={cap.name}
          title={cap.cameraPrompt ?? cap.name}
          className={`nx9-stage-frame-thumb${i === frames.length - 1 ? ' is-latest' : ''}`}
        />
      ))}
    </div>
  );
}
