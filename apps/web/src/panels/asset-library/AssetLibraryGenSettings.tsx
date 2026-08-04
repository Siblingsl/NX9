import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  resolveImageRequestSize,
} from '@nx9/shared';
import { useConnectedPictureModels } from '../../hooks/use-connected-picture-models';
import { ComposerModelSelect } from '../../engine/stage-deck/chrome/attached-workspace/composer/ComposerModelSelect';
import {
  VideoPopover,
  PopoverItem,
} from '../../engine/stage-deck/chrome/attached-workspace/generation/video/VideoPopover';

/** 与图像生成节点 PictureParamChips 对齐的清晰度档位 */
export const IMAGE_RESOLUTION_TIER_OPTIONS = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
] as const;

export type AssetLibraryResolutionTier = (typeof IMAGE_RESOLUTION_TIER_OPTIONS)[number]['id'];

export interface AssetLibraryGenSettingsValue {
  model: string;
  quality: string;
  aspectRatio: string;
  /** 清晰度：1k / 2k / 4k，与图像生成节点 resolutionTier 对齐 */
  resolutionTier: AssetLibraryResolutionTier | string;
}

export const DEFAULT_ASSET_LIBRARY_GEN_SETTINGS: AssetLibraryGenSettingsValue = {
  model: 'gemini-2.5-flash-image',
  quality: 'high',
  aspectRatio: '4:3',
  resolutionTier: '2k',
};

export const DEFAULT_COSTUME_GEN_SETTINGS: AssetLibraryGenSettingsValue = {
  model: 'gemini-2.5-flash-image',
  quality: 'high',
  aspectRatio: '1:1',
  resolutionTier: '2k',
};

export const DEFAULT_SCENE_GEN_SETTINGS: AssetLibraryGenSettingsValue = {
  model: 'gemini-2.5-flash-image',
  quality: 'high',
  aspectRatio: '16:9',
  resolutionTier: '2k',
};

/**
 * 将素材库 UI 参数解析为请求 size / model。
 * 清晰度档位会在 quality+比例 基础上再 cap / 上推最大边。
 */
export function resolveAssetLibraryImageRequest(
  ui: Partial<AssetLibraryGenSettingsValue> | undefined,
  fallbacks?: {
    model?: string;
    quality?: string;
    aspectRatio?: string;
    resolutionTier?: string;
    width?: number;
    height?: number;
  },
): {
  modelId: string;
  quality: string;
  aspectRatio: string;
  resolutionTier: string;
  width: number;
  height: number;
  size: string;
} {
  let quality = ui?.quality || fallbacks?.quality || 'high';
  let aspectRatio = ui?.aspectRatio || fallbacks?.aspectRatio || '1:1';
  const resolutionTier = (ui?.resolutionTier || fallbacks?.resolutionTier || '2k') as string;
  const modelId = ui?.model || fallbacks?.model || 'gemini-2.5-flash-image';

  // 4K 清晰度时抬高质量，并在方图下切到 4k 比例选项（与节点行为一致）
  if (resolutionTier === '4k') {
    if (quality === 'auto' || quality === 'low' || quality === 'medium') quality = 'high';
    if (aspectRatio === '1:1' || aspectRatio === '2k') aspectRatio = '4k';
  } else if (resolutionTier === '2k') {
    if (aspectRatio === '4k') aspectRatio = '2k';
  }

  let resolved = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? fallbacks?.width || 1024 : undefined,
    height: aspectRatio === 'custom' ? fallbacks?.height || 1024 : undefined,
    snapToStep: true,
  });

  const maxSide = Math.max(resolved.width, resolved.height);
  const tierCap = resolutionTier === '4k' ? 4096 : resolutionTier === '1k' ? 1024 : 2048;
  if (maxSide > tierCap && maxSide > 0) {
    const ratio = tierCap / maxSide;
    const w = Math.round((resolved.width * ratio) / 16) * 16;
    const h = Math.round((resolved.height * ratio) / 16) * 16;
    resolved = { width: w, height: h, size: `${w}x${h}` };
  } else if (resolutionTier === '4k' && maxSide < 2048) {
    const scale = Math.min(4096 / maxSide, 4);
    if (scale > 1.05) {
      const w = Math.round((resolved.width * scale) / 16) * 16;
      const h = Math.round((resolved.height * scale) / 16) * 16;
      resolved = { width: w, height: h, size: `${w}x${h}` };
    }
  }

  return {
    modelId,
    quality,
    aspectRatio,
    resolutionTier,
    width: resolved.width,
    height: resolved.height,
    size: resolved.size,
  };
}

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
      <VideoPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={width} tone="desk">
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

interface AssetLibraryGenSettingsProps {
  value: AssetLibraryGenSettingsValue;
  onChange: (patch: Partial<AssetLibraryGenSettingsValue>) => void;
  /** 角色设定板默认 4:3；服装设定板默认 1:1 */
  preset?: 'character-sheet' | 'costume-sheet' | 'scene' | 'generic';
  compact?: boolean;
  className?: string;
}

const QUALITY_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高质量',
  medium: '中质量',
  low: '低质量',
};

/** 素材库出图参数：对齐图像生成节点（设置连接模型下拉 + 质量/比例/清晰度 chips） */
function AssetLibraryGenSettings({
  value,
  onChange,
  preset = 'generic',
  compact = false,
  className = '',
}: AssetLibraryGenSettingsProps) {
  const {
    options: pictureModelOptions,
    hasConnections: hasPictureConnections,
    preferredModel,
    selectModel: selectPictureModel,
    openConnectionsSettings,
  } = useConnectedPictureModels(value.model);

  useEffect(() => {
    if (!preferredModel || preferredModel === value.model) return;
    if (!hasPictureConnections) return;
    onChange({ model: preferredModel });
  }, [hasPictureConnections, onChange, preferredModel, value.model]);

  const preview = useMemo(() => resolveAssetLibraryImageRequest(value), [value]);

  const qualityDisplay =
    QUALITY_LABELS[value.quality]
    ?? IMAGE_QUALITY_OPTIONS.find((o) => o.id === value.quality)?.label
    ?? value.quality;
  const aspectLabel =
    IMAGE_ASPECT_OPTIONS.find((o) => o.id === value.aspectRatio)?.label ?? value.aspectRatio;
  const resLabel =
    IMAGE_RESOLUTION_TIER_OPTIONS.find((o) => o.id === value.resolutionTier)?.label
    ?? value.resolutionTier
    ?? '2K';

  const presetLabel =
    preset === 'character-sheet'
      ? '角色设定板'
      : preset === 'costume-sheet'
        ? '服装设定板'
        : preset === 'scene'
          ? '场景'
          : '';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${compact ? '' : 'py-1'} ${className}`}
      onMouseDown={stop}
    >
      {!compact && presetLabel ? (
        <span className="text-[10px] text-ink/45 shrink-0">{presetLabel}</span>
      ) : null}
      <ComposerModelSelect
        value={value.model}
        options={
          pictureModelOptions.length > 0
            ? pictureModelOptions
            : [{ id: value.model, label: '未配置图片连接 · 点此去设置' }]
        }
        onChange={(model) => {
          if (!hasPictureConnections) {
            openConnectionsSettings();
            return;
          }
          void selectPictureModel(model, (id) => onChange({ model: id }));
        }}
        width={260}
        tone="desk"
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={aspectLabel}
        active={value.aspectRatio}
        options={[
          ...IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
        ]}
        onSelect={(aspectRatio) => onChange({ aspectRatio })}
        width={160}
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={qualityDisplay}
        active={value.quality}
        options={IMAGE_QUALITY_OPTIONS.map((o) => ({
          id: o.id,
          label: QUALITY_LABELS[o.id] ?? o.label,
        }))}
        onSelect={(quality) => onChange({ quality })}
      />
      <span className="text-ink/20 text-[10px] select-none">·</span>
      <ParamChip
        label={resLabel}
        active={value.resolutionTier || '2k'}
        options={IMAGE_RESOLUTION_TIER_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
        onSelect={(resolutionTier) => {
          const patch: Partial<AssetLibraryGenSettingsValue> = { resolutionTier };
          if (resolutionTier === '4k') {
            patch.quality = 'high';
            if (value.aspectRatio === '1:1' || value.aspectRatio === '2k') {
              patch.aspectRatio = '4k';
            }
          } else if (resolutionTier === '2k' && value.aspectRatio === '4k') {
            patch.aspectRatio = '2k';
          }
          onChange(patch);
        }}
        width={100}
      />
      <span className="ml-auto text-[10px] tabular-nums text-ink/40 shrink-0">{preview.size}</span>
    </div>
  );
}

export default memo(AssetLibraryGenSettings);
