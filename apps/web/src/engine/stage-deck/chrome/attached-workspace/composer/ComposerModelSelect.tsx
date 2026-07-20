import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ComposerPopover, PopoverItem } from './ComposerPopover';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface ComposerModelSelectProps {
  value: string;
  options: { id: string; label: string }[];
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
        className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] text-ink/60 hover:text-ink hover:bg-surface/80 transition-colors max-w-[220px]"
      >
        <span className="truncate">{shortLabel}</span>
        <ChevronDown size={11} className="text-ink/30 shrink-0" />
      </button>
      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        align="end"
        width={width}
        tone={tone}
      >
        {options.map((o) => (
          <PopoverItem
            key={o.id}
            active={o.id === value}
            onClick={() => {
              onChange(o.id);
              setOpen(false);
            }}
          >
            {o.label}
          </PopoverItem>
        ))}
      </ComposerPopover>
    </>
  );
}
