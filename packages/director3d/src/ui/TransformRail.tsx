import { useDirectorStore } from '../store/directorStore';

const MODES = [
  { id: 'translate' as const, label: 'T' },
  { id: 'rotate' as const, label: 'R' },
  { id: 'scale' as const, label: 'S' },
];

export function TransformRail() {
  const mode = useDirectorStore((s) => s.transformMode);
  const setMode = useDirectorStore((s) => s.setTransformMode);

  return (
    <div className="nx9-stage-transform-rail" aria-label="Transform">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.id}
          className={`nx9-stage-transform-btn${mode === m.id ? ' is-on' : ''}`}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
