import { useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { VideoPopover } from '../video/VideoPopover';
import {
  lookupPictureGenModeDef,
  PICTURE_GEN_MODES,
  type PictureGenMode,
} from './picture-gen-modes';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureGenModeChipProps {
  mode: PictureGenMode;
  onChange: (mode: PictureGenMode) => void;
}

export function PictureGenModeChip({ mode, onChange }: PictureGenModeChipProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = lookupPictureGenModeDef(mode);
  const Icon = current.icon;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] transition-colors ${
          open ? 'bg-surface text-ink' : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
      >
        <Icon size={12} className="text-ink/45 shrink-0" />
        <span>{current.label}</span>
        <ChevronUp size={10} className={`text-ink/30 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      <VideoPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        width={148}
      >
        <p className="px-3 pt-2 pb-1 text-[10px] text-ink/40">图像生成模式</p>
        {PICTURE_GEN_MODES.map((m) => {
          const ItemIcon = m.icon;
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`w-[calc(100%-8px)] flex items-center gap-2 px-2.5 py-1.5 mx-1 rounded-lg text-[11px] transition-colors ${
                active ? 'bg-surface text-ink font-medium' : 'text-ink/65 hover:bg-surface/80'
              }`}
            >
              <ItemIcon size={14} className={active ? 'text-ink/70' : 'text-ink/40'} />
              {m.label}
            </button>
          );
        })}
        <div className="h-1" />
      </VideoPopover>
    </>
  );
}
