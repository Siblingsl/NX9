import { Fragment, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ComposerPopover, PopoverItem } from './ComposerPopover';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface ComposerModelOption {
  id: string;
  label: string;
  /** 分组标题：与前一项不同时渲染小节标题（未提供则不分组） */
  groupLabel?: string;
  /** 能力说明（可选，随分组项展示） */
  hint?: string;
}

export interface ComposerModelSelectProps {
  value: string;
  options: ComposerModelOption[];
  onChange: (id: string) => void;
  width?: number;
  tone?: 'default' | 'desk';
}

export function ComposerModelSelect({
  value,
  options,
  onChange,
  width = 168,
  tone = 'default',
}: ComposerModelSelectProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.id === value)?.label ?? value;
  const shortLabel = label.includes(' · ') ? label.split(' · ')[0] : label;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        title={value}
        className={
          tone === 'desk'
            ? 'kp__btn max-w-[220px]'
            : 'inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] text-ink/60 hover:text-ink hover:bg-surface/80 transition-colors max-w-[220px]'
        }
        style={tone === 'desk' ? { padding: '4px 8px', fontSize: 10 } : undefined}
      >
        <span className="truncate">{shortLabel}</span>
        <ChevronDown size={11} className={tone === 'desk' ? 'shrink-0 opacity-50' : 'text-ink/30 shrink-0'} />
      </button>
      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="end"
        width={width}
        tone={tone}
      >
        {options.map((o, i) => {
          const showGroup =
            Boolean(o.groupLabel) && o.groupLabel !== options[i - 1]?.groupLabel;
          return (
            <Fragment key={o.id}>
              {showGroup && (
                <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-medium uppercase tracking-wide text-ink/35">
                  {o.groupLabel}
                </p>
              )}
              <PopoverItem
                active={o.id === value}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className="block truncate">{o.label}</span>
                {o.hint && (
                  <span className="block truncate text-[9px] text-ink/40">{o.hint}</span>
                )}
              </PopoverItem>
            </Fragment>
          );
        })}
      </ComposerPopover>
    </>
  );
}
