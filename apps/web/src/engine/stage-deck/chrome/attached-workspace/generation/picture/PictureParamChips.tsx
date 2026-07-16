import { useRef, useState } from 'react';
import { IMAGE_ASPECT_OPTIONS, IMAGE_QUALITY_OPTIONS } from '@nx9/shared';
import { VideoPopover, PopoverItem } from '../video/VideoPopover';
import { useAttachedNodeData } from '../use-attached-node-data';
import { modeNeedsPrimaryRef, readPictureGenMode } from './picture-gen-modes';

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
      <VideoPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        width={width}
        tone="desk"
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

/** LibTV 风格：16:9 · 高质量 · 4K · 1张 */
const RESOLUTION_OPTIONS = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
] as const;

const COUNT_OPTIONS = [1, 2, 3, 4, 6, 8].map((n) => ({ id: String(n), label: `×${n}` }));

const STRENGTH_OPTIONS = [
  { id: '0.35', label: '弱 0.35' },
  { id: '0.55', label: '中 0.55' },
  { id: '0.75', label: '强 0.75' },
  { id: '0.85', label: '很强 0.85' },
  { id: '0.95', label: '极强 0.95' },
];

export interface PictureParamChipsProps {
  blockId: string;
  onPatch: (patch: Record<string, unknown>) => void;
  /** 紧凑一行展示（默认 true，对齐 LibTV 底栏） */
  compact?: boolean;
}

export function PictureParamChips({ blockId, onPatch }: PictureParamChipsProps) {
  const data = useAttachedNodeData(blockId);

  const quality = (data.quality as string) ?? 'auto';
  const aspectRatio = (data.aspectRatio as string) ?? '1:1';
  const imageCount = (data.imageCount as number) ?? 1;
  const imageStrength = (data.imageStrength as number) ?? 0.85;
  const resolution = (data.resolutionTier as string) ?? '2k';
  const mode = readPictureGenMode(data);
  const showStrength =
    modeNeedsPrimaryRef(mode) ||
    data.pictureGenMode === 'upscale-hd' ||
    data.pictureProAction === 'image-to-image';

  const qualityLabel =
    IMAGE_QUALITY_OPTIONS.find((o) => o.id === quality)?.label ??
    (quality === 'auto' ? '自动' : quality);
  // LibTV 显示「高质量」而不是「高」
  const qualityDisplay =
    quality === 'high' ? '高质量' : quality === 'medium' ? '中质量' : quality === 'low' ? '低质量' : qualityLabel;

  const aspectLabel =
    IMAGE_ASPECT_OPTIONS.find((o) => o.id === aspectRatio)?.label ??
    (aspectRatio === 'custom' ? '自定义' : aspectRatio);

  const resLabel =
    RESOLUTION_OPTIONS.find((o) => o.id === resolution)?.label ?? resolution;

  const strengthLabel =
    STRENGTH_OPTIONS.find((o) => Number(o.id) === imageStrength)?.label ??
    `强度 ${imageStrength}`;

  return (
    <div className="flex items-center gap-0.5 flex-wrap nodrag nopan" onMouseDown={stop}>
      <ParamChip
        label={aspectLabel}
        active={aspectRatio}
        options={[
          ...IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
          { id: 'custom', label: '自定义尺寸' },
        ]}
        onSelect={(v) => onPatch({ aspectRatio: v })}
        width={160}
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={qualityDisplay}
        active={quality}
        options={IMAGE_QUALITY_OPTIONS.map((o) => ({
          id: o.id,
          label: o.id === 'high' ? '高质量' : o.id === 'medium' ? '中质量' : o.id === 'low' ? '低质量' : o.label,
        }))}
        onSelect={(v) => onPatch({ quality: v })}
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={resLabel}
        active={resolution}
        options={RESOLUTION_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(v) => {
          // 分辨率档位同时映射 quality / aspect 中的 2k/4k 选项
          const patch: Record<string, unknown> = { resolutionTier: v };
          if (v === '4k') {
            patch.quality = 'high';
            if (aspectRatio === '1:1' || aspectRatio === '2k') patch.aspectRatio = '4k';
          } else if (v === '2k') {
            if (aspectRatio === '4k') patch.aspectRatio = '2k';
          }
          onPatch(patch);
        }}
        width={100}
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={`${imageCount}张`}
        active={String(imageCount)}
        options={COUNT_OPTIONS.map((o) => ({ id: o.id, label: `${o.id}张` }))}
        onSelect={(v) => onPatch({ imageCount: Number(v) })}
      />
      {showStrength && (
        <>
          <span className="text-ink/20 text-[10px] select-none">·</span>
          <ParamChip
            label={strengthLabel}
            active={String(imageStrength)}
            options={STRENGTH_OPTIONS}
            onSelect={(v) => onPatch({ imageStrength: Number(v) })}
            width={128}
          />
        </>
      )}
    </div>
  );
}
