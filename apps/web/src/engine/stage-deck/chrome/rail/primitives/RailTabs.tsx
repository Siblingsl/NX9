import type { ContextRailTab } from '../../../stores/context-rail-ui';
import { SlidersHorizontal, Clapperboard, ScrollText, Layers } from 'lucide-react';

const TAB_CONFIG: { id: ContextRailTab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'inspector', label: '检查器', icon: SlidersHorizontal },
  { id: 'storyboard', label: '分镜', icon: Clapperboard },
  { id: 'script', label: '编剧', icon: ScrollText },
  { id: 'library', label: '资源库', icon: Layers },
];

interface RailTabsProps {
  active: ContextRailTab;
  onChange: (tab: ContextRailTab) => void;
}

export function RailTabs({ active, onChange }: RailTabsProps) {
  return (
    <div className="flex flex-1 min-w-0 items-stretch nx9-rail-tab">
      {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          title={label}
          className={`min-w-0 flex-1 flex items-center justify-center gap-1 px-1 text-xs font-medium whitespace-nowrap transition-colors ${
            active === id
              ? 'bg-brand/10 text-brand border-b-2 border-brand'
              : 'text-ink/50 hover:bg-surface hover:text-ink/70'
          }`}
        >
          <Icon size={14} className="shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
