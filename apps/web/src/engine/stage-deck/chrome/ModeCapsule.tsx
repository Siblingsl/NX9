import type { ViewMode } from '@nx9/shared';
import { useViewMode } from '../stores/view-mode';
import { useStudioSurface } from '../../../stores/studio-surface';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'produce', label: '制作' },
  { id: 'explore', label: '编排' },
  { id: 'review', label: '审片' },
];

export function ModeCapsule() {
  const mode = useViewMode((s) => s.mode);
  const setMode = useViewMode((s) => s.setMode);
  const setExpertWorkflow = useStudioSurface((s) => s.setExpertWorkflow);

  return (
    <div className="flex items-center rounded-lg border border-line/70 bg-surface/40 p-0.5 text-[11px] nx9-mode-capsule shrink-0">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => {
            setMode(m.id);
            // 编排模式与专家工作流偏好联动；制作/审片回到制作台偏好
            if (m.id === 'explore') setExpertWorkflow(true);
            else if (m.id === 'produce') setExpertWorkflow(false);
          }}
          className={`px-2.5 py-1 rounded-md transition-all duration-200 whitespace-nowrap ${
            mode === m.id
              ? 'bg-white text-brand shadow-sm font-medium'
              : 'text-ink/50 hover:text-ink/75'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
