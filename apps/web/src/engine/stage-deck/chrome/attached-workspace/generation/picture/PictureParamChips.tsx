import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { IMAGE_ASPECT_OPTIONS, IMAGE_QUALITY_OPTIONS } from '@nx9/shared';
import { VideoPopover, PopoverItem } from '../video/VideoPopover';
import { useAttachedNodeData } from '../use-attached-node-data';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function ParamChip({
  label,
  active,
  options,
  onSelect,
  width = 140,
}: {
  label: string;
  active: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
  width?: number;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] transition-colors ${
          open ? 'bg-surface/90 text-ink' : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
      >
        {label}
      </button>
      <VideoPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={width}>
        {options.map((o) => (
          <PopoverItem
            key={o.id}
            active={o.id === active}
            onClick={() => {
              onSelect(o.id);
              setOpen(false);
            }}
          >
            {o.label}
          </PopoverItem>
        ))}
      </VideoPopover>
    </>
  );
}

export interface PictureParamChipsProps {
  blockId: string;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function PictureParamChips({ blockId, onPatch }: PictureParamChipsProps) {
  const data = useAttachedNodeData(blockId);

  const quality = (data.quality as string) ?? 'auto';
  const aspectRatio = (data.aspectRatio as string) ?? '1:1';
  const imageCount = (data.imageCount as number) ?? 1;

  const qualityLabel =
    IMAGE_QUALITY_OPTIONS.find((o) => o.id === quality)?.label ?? quality;
  const aspectLabel =
    IMAGE_ASPECT_OPTIONS.find((o) => o.id === aspectRatio)?.label ?? aspectRatio;

  return (
    <div className="flex items-center gap-0.5 nodrag nopan" onMouseDown={stop}>
      <ParamChip
        label={qualityLabel}
        active={quality}
        options={IMAGE_QUALITY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(v) => onPatch({ quality: v })}
      />
      <ParamChip
        label={aspectLabel}
        active={aspectRatio}
        options={IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(v) => onPatch({ aspectRatio: v })}
        width={152}
      />
      <ParamChip
        label={`×${imageCount}`}
        active={String(imageCount)}
        options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: `×${n}` }))}
        onSelect={(v) => onPatch({ imageCount: Number(v) })}
      />
    </div>
  );
}
