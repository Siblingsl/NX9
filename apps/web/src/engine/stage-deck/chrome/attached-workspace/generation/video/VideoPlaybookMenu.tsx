import { useMemo, useRef, useState } from 'react';
import { Clapperboard, Wand2 } from 'lucide-react';
import { ComposerPopover } from '../../composer/ComposerPopover';
import {
  VIDEO_PLAYBOOK_ACTIONS,
  VIDEO_PLAYBOOK_CATEGORIES,
  type VideoPlaybookActionDef,
  type VideoPlaybookCategoryId,
} from './video-playbooks';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const ACTION_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'depth-action-replica': Clapperboard,
};

const MENU_CATEGORIES: VideoPlaybookCategoryId[] = ['action'];

export interface VideoPlaybookMenuProps {
  activeId?: string | null;
  onSelect: (action: VideoPlaybookActionDef) => void;
  variant?: 'toolbar' | 'header';
}

export function VideoPlaybookMenu({
  activeId,
  onSelect,
  variant = 'header',
}: VideoPlaybookMenuProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    return MENU_CATEGORIES.map((catId) => {
      const cat = VIDEO_PLAYBOOK_CATEGORIES.find((c) => c.id === catId)!;
      const actions = VIDEO_PLAYBOOK_ACTIONS.filter((a) => a.category === catId);
      return { cat, actions };
    }).filter((g) => g.actions.length > 0);
  }, []);

  const activeLabel =
    VIDEO_PLAYBOOK_ACTIONS.find((a) => a.id === activeId)?.label ?? '热门玩法';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'header'
            ? `inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
                open || activeId
                  ? 'bg-brand/10 text-brand'
                  : 'text-ink/55 hover:text-ink hover:bg-surface/80'
              }`
            : `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors ${
                open || activeId
                  ? 'bg-brand/10 text-brand'
                  : 'text-ink/55 hover:text-ink hover:bg-surface/90'
              }`
        }
        title="热门视频玩法"
      >
        <Wand2 size={variant === 'header' ? 13 : 12} />
        <span className="max-w-[100px] truncate">{activeLabel}</span>
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="start"
        width={360}
        tone="desk"
      >
        <div className="px-2.5 pt-2.5 pb-2" onMouseDown={stop}>
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[11px] font-medium text-ink/70">热门视频玩法</p>
            <p className="text-[9px] text-ink/35">对齐图像专业工具</p>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto nx9-scroll pr-0.5">
            {grouped.map(({ cat, actions }) => (
              <div key={cat.id} className="min-w-0">
                <p className="px-1.5 mb-1 text-[10px] font-medium text-ink/40 tracking-wide">
                  {cat.label}
                </p>
                <div className="space-y-0.5">
                  {actions.map((a) => {
                    const Icon = ACTION_ICONS[a.id] ?? Wand2;
                    const active = a.id === activeId;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onSelect(a);
                          setOpen(false);
                        }}
                        className={`w-full flex items-start gap-2 px-1.5 py-1.5 rounded-lg text-left transition-colors ${
                          active
                            ? 'bg-brand/10 text-ink'
                            : 'text-ink/70 hover:bg-ink/[0.04]'
                        }`}
                        title={a.hint}
                      >
                        <span
                          className={`mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                            active ? 'bg-brand/15 text-brand' : 'bg-ink/[0.04] text-ink/45'
                          }`}
                        >
                          <Icon size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium leading-tight">
                            {a.label}
                          </span>
                          <span className="block text-[9px] text-ink/40 leading-snug line-clamp-2">
                            {a.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}
