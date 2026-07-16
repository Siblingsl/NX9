import { useRef, useState } from 'react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  PICTURE_GEN_MODELS,
  type StoryboardPreviewPictureSettings,
} from '@nx9/shared';
import { ComposerModelSelect } from '../composer/ComposerModelSelect';
import { VideoPopover, PopoverItem } from '../generation/video/VideoPopover';
import { PictureGenModeChip } from '../generation/picture/PictureGenModeChip';
import type { PictureGenMode } from '../generation/picture/picture-gen-modes';

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

export interface StoryboardPreviewGenSettingsProps {
  settings: StoryboardPreviewPictureSettings;
  onChange: (patch: Partial<StoryboardPreviewPictureSettings>) => void;
}

export function StoryboardPreviewGenSettings({
  settings,
  onChange,
}: StoryboardPreviewGenSettingsProps) {
  const qualityLabel =
    IMAGE_QUALITY_OPTIONS.find((o) => o.id === settings.quality)?.label ?? settings.quality;
  const aspectLabel =
    IMAGE_ASPECT_OPTIONS.find((o) => o.id === settings.aspectRatio)?.label ?? settings.aspectRatio;

  return (
    <div
      className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-line/20 bg-surface/10"
      onMouseDown={stop}
    >
      <ComposerModelSelect
        value={settings.model}
        options={PICTURE_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
        onChange={(model: string) => onChange({ model })}
      />
      <span className="w-px h-3.5 bg-line/50" />
      <PictureGenModeChip
        mode={settings.pictureGenMode as PictureGenMode}
        modes={['text-to-image', 'image-to-image']}
        onChange={(mode) => {
          if (mode === 'text-to-image' || mode === 'image-to-image') {
            onChange({ pictureGenMode: mode });
          }
        }}
      />
      <span className="w-px h-3.5 bg-line/50" />
      <ParamChip
        label={qualityLabel}
        active={settings.quality}
        options={IMAGE_QUALITY_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(quality) => onChange({ quality })}
      />
      <ParamChip
        label={aspectLabel}
        active={settings.aspectRatio}
        options={IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(aspectRatio) => onChange({ aspectRatio })}
        width={152}
      />
      <span className="text-[9px] text-ink/35 ml-auto">每镜 ×1</span>
    </div>
  );
}
