import { useRef, useState } from 'react';
import {
  CLIP_GEN_ASPECTS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
} from '@nx9/shared';
import { VideoPopover, PopoverItem } from './VideoPopover';
import { useAttachedNodeData } from '../use-attached-node-data';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function ParamChip({
  label,
  active,
  options,
  onSelect,
}: {
  label: string;
  active: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
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
          open
            ? 'bg-surface/90 text-ink'
            : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
      >
        {label}
      </button>
      <VideoPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        width={140}
      >
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

const AUDIO_OPTIONS = [
  { id: 'true', label: '有声' },
  { id: 'false', label: '无声' },
] as const;

export interface VideoParamChipsProps {
  blockId: string;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function VideoParamChips({ blockId, onPatch }: VideoParamChipsProps) {
  const data = useAttachedNodeData(blockId);

  const aspect = (data.aspect as string) ?? '16:9';
  const durationSec = (data.durationSec as number) ?? 5;
  const resolution = (data.resolution as string) ?? '720';
  const imageCount = (data.imageCount as number) ?? 1;
  const generateAudio = (data.generateAudio as boolean | undefined) ?? false;

  const resLabel =
    VIDEO_RESOLUTION_OPTIONS.find((o) => o.id === resolution)?.label ?? `${resolution}p`;

  return (
    <div className="flex items-center gap-0.5 nodrag nopan" onMouseDown={stop}>
      <ParamChip
        label={resLabel}
        active={resolution}
        options={VIDEO_RESOLUTION_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(v) => onPatch({ resolution: v })}
      />
      <ParamChip
        label={aspect}
        active={aspect}
        options={CLIP_GEN_ASPECTS.map((o) => ({ id: o.id, label: o.id }))}
        onSelect={(v) => onPatch({ aspect: v })}
      />
      <ParamChip
        label={`${durationSec}s`}
        active={String(durationSec)}
        options={VIDEO_DURATION_OPTIONS.map((n) => ({ id: String(n), label: `${n}s` }))}
        onSelect={(v) => onPatch({ durationSec: Number(v) })}
      />
      <ParamChip
        label={`×${imageCount}`}
        active={String(imageCount)}
        options={[1, 2, 3, 4].map((n) => ({ id: String(n), label: `×${n}` }))}
        onSelect={(v) => onPatch({ imageCount: Number(v) })}
      />
      <ParamChip
        label={generateAudio ? '有声' : '无声'}
        active={String(generateAudio)}
        options={AUDIO_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(v) => onPatch({ generateAudio: v === 'true' })}
      />
    </div>
  );
}
