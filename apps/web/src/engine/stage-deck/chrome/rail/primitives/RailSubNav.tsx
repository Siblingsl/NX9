import type { LibrarySubTab } from '../../../stores/context-rail-ui';

const SUB_TABS: { id: LibrarySubTab; label: string }[] = [
  { id: 'templates', label: '模板' },
  { id: 'history', label: '历史' },
  { id: 'workflow', label: '工作流' },
];

interface RailSubNavProps {
  active: LibrarySubTab;
  onChange: (tab: LibrarySubTab) => void;
}

export function RailSubNav({ active, onChange }: RailSubNavProps) {
  return (
    <div className="flex rounded-lg bg-surface p-0.5 gap-0.5">
      {SUB_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-1 text-center text-xs py-1.5 rounded-md transition-colors ${
            active === id
              ? 'bg-white text-ink font-medium shadow-sm'
              : 'text-ink/50 hover:text-ink/70'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
