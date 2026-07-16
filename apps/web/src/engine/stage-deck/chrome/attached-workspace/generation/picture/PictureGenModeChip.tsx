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
  modes?: PictureGenMode[];
}

export function PictureGenModeChip({ mode, onChange, modes }: PictureGenModeChipProps) {
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
        <ChevronUp
          size={10}
          className={`text-ink/30 transition-transform ${open ? '' : 'rotate-180'}`}
        />
      </button>

      <VideoPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        width={200}
      >
        <p className="px-3 pt-2 pb-1 text-[10px] text-ink/40">图像生成模式</p>
        {PICTURE_GEN_MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => {
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
              className={`w-[calc(100%-8px)] flex items-start gap-2 px-2.5 py-1.5 mx-1 rounded-lg text-left transition-colors ${
                active ? 'bg-surface text-ink' : 'text-ink/65 hover:bg-surface/80'
              }`}
            >
              <ItemIcon
                size={14}
                className={`mt-0.5 shrink-0 ${active ? 'text-ink/70' : 'text-ink/40'}`}
              />
              <span className="min-w-0">
                <span className={`block text-[11px] ${active ? 'font-medium' : ''}`}>
                  {m.label}
                </span>
                <span className="block text-[9px] text-ink/40 leading-snug">{m.hint}</span>
              </span>
            </button>
          );
        })}
        <div className="h-1" />
      </VideoPopover>
    </>
  );
}
