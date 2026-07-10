import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Film,
  HelpCircle,
  History,
  Layers,
  LayoutTemplate,
  MoreHorizontal,
  Settings,
} from 'lucide-react';
import { StudioDropdownPanel } from './StudioDropdownPanel';
import { isSurfaceEnabled } from '../config/product-surface';

export interface StudioOverflowMenuProps {
  remotionOpen: boolean;
  usageOpen: boolean;
  assetLibOpen: boolean;
  onToggleRemotion: () => void;
  onToggleUsage: () => void;
  onOpenWorkflowTemplates: () => void;
  onOpenHistory: () => void;
  onToggleAssetLib: () => void;
  onOpenSkills: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: typeof Film;
  active?: boolean;
  onClick: () => void;
}

export function StudioOverflowMenu(props: StudioOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const items: MenuItem[] = [
    isSurfaceEnabled('episodeStudio') && {
      id: 'remotion',
      label: '成片工作室',
      icon: Film,
      active: props.remotionOpen,
      onClick: () => {
        props.onToggleRemotion();
        setOpen(false);
      },
    },
    isSurfaceEnabled('assetLibraryModal') && {
      id: 'asset-library',
      label: '素材库',
      icon: Layers,
      active: props.assetLibOpen,
      onClick: () => {
        props.onToggleAssetLib();
        setOpen(false);
      },
    },
    isSurfaceEnabled('libraryRail') && {
      id: 'workflow',
      label: '进阶配方',
      icon: LayoutTemplate,
      onClick: () => {
        props.onOpenWorkflowTemplates();
        setOpen(false);
      },
    },
    isSurfaceEnabled('generationHistory') && {
      id: 'history',
      label: '生成历史',
      icon: History,
      onClick: () => {
        props.onOpenHistory();
        setOpen(false);
      },
    },
    isSurfaceEnabled('usageTracking') && {
      id: 'usage',
      label: '用量追踪',
      icon: BarChart3,
      active: props.usageOpen,
      onClick: () => {
        props.onToggleUsage();
        setOpen(false);
      },
    },
    isSurfaceEnabled('skillsDrawer') && {
      id: 'skills',
      label: '技能库',
      icon: BookOpen,
      onClick: () => {
        props.onOpenSkills();
        setOpen(false);
      },
    },
    isSurfaceEnabled('shortcuts') && {
      id: 'shortcuts',
      label: '快捷键',
      icon: HelpCircle,
      onClick: () => {
        props.onOpenShortcuts();
        setOpen(false);
      },
    },
    isSurfaceEnabled('settings') && {
      id: 'settings',
      label: '设置',
      icon: Settings,
      onClick: () => {
        props.onOpenSettings();
        setOpen(false);
      },
    },
  ].filter(Boolean) as MenuItem[];

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`nx9-topbar-icon-btn ${open || activeCount > 0 ? 'nx9-topbar-icon-btn--active' : ''}`}
        title="更多工具"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal size={17} />
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand ring-2 ring-white" />
        )}
      </button>

      <StudioDropdownPanel
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        width={208}
        className="max-h-[min(70vh,420px)] overflow-y-auto nx9-scroll py-1.5"
      >
        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink/35">
          工具与面板
        </p>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={item.onClick}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
                item.active
                  ? 'bg-brand/8 text-brand'
                  : 'text-ink/75 hover:bg-surface hover:text-ink'
              }`}
            >
              <Icon size={15} className="shrink-0 opacity-70" />
              {item.label}
            </button>
          );
        })}
      </StudioDropdownPanel>
    </div>
  );
}
