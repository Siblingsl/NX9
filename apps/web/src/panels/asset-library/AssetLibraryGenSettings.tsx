import { memo, useMemo } from 'react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  PICTURE_GEN_MODELS,
  resolveImageRequestSize,
} from '@nx9/shared';
import GenSettingsPills from '../../blocks/shared/GenSettingsPills';

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
    // 目标 4K 但基础尺寸偏小：等比放大到接近 4K（仍受模型上限）
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

interface AssetLibraryGenSettingsProps {
  value: AssetLibraryGenSettingsValue;
  onChange: (patch: Partial<AssetLibraryGenSettingsValue>) => void;
  /** 角色设定板默认 4:3；服装设定板默认 1:1 */
  preset?: 'character-sheet' | 'costume-sheet' | 'scene' | 'generic';
  compact?: boolean;
  className?: string;
  hint?: string;
  /** 是否显示标题栏 */
  showTitle?: boolean;
}

const QUALITY_LABELS: Record<string, string> = {
  auto: '自动',
  high: '高质量',
  medium: '中质量',
  low: '低质量',
};

/** 素材库出图参数：模型 / 质量 / 比例 / 清晰度（对齐图像生成节点） */
function AssetLibraryGenSettings({
  value,
  onChange,
  preset = 'generic',
  compact = false,
  className = '',
  hint,
  showTitle = true,
}: AssetLibraryGenSettingsProps) {
  const modelOptions = useMemo(
    () =>
      PICTURE_GEN_MODELS.map((m) => ({
        id: m.id,
        // 保持可读：免费档写全名，避免缩成 G 2.5 找不到
        label: m.label,
      })),
    [],
  );
  const qualityOptions = useMemo(
    () =>
      IMAGE_QUALITY_OPTIONS.map((o) => ({
        id: o.id,
        label: QUALITY_LABELS[o.id] ?? o.label,
      })),
    [],
  );
  const aspectOptions = useMemo(
    () => IMAGE_ASPECT_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    [],
  );
  const resolutionOptions = useMemo(
    () => IMAGE_RESOLUTION_TIER_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    [],
  );

  const preview = useMemo(
    () => resolveAssetLibraryImageRequest(value),
    [value],
  );

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
      className={`rounded-xl border border-brand/25 bg-brand/[0.04] p-3 space-y-2.5 shadow-sm ${className}`}
    >
      {showTitle ? (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] font-semibold text-ink/75">
            出图参数
            {presetLabel ? ` · ${presetLabel}` : ''}
          </p>
          <p className="text-[10px] tabular-nums text-brand/80 font-medium">
            {preview.size}
            <span className="text-ink/35 font-normal"> · 将用于本次生成</span>
          </p>
        </div>
      ) : null}
      {hint ? <p className="text-[10px] text-ink/45 leading-relaxed">{hint}</p> : null}
      <div
        className={`grid gap-2.5 ${
          compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        <GenSettingsPills
          label="模型"
          options={modelOptions}
          value={value.model}
          onChange={(model) => onChange({ model })}
          compact
        />
        <GenSettingsPills
          label="清晰度"
          options={resolutionOptions}
          value={value.resolutionTier || '2k'}
          onChange={(resolutionTier) => {
            const patch: Partial<AssetLibraryGenSettingsValue> = { resolutionTier };
            // 与节点一致：切 4K 时抬高质量
            if (resolutionTier === '4k' && value.quality !== 'high') {
              patch.quality = 'high';
            }
            onChange(patch);
          }}
          compact
        />
        <GenSettingsPills
          label="质量"
          options={qualityOptions}
          value={value.quality}
          onChange={(quality) => onChange({ quality })}
          compact
        />
        <GenSettingsPills
          label="比例"
          options={aspectOptions}
          value={value.aspectRatio}
          onChange={(aspectRatio) => onChange({ aspectRatio })}
          compact
        />
      </div>
      <p className="text-[9px] leading-relaxed text-ink/40">
        与画布「图像生成」节点同级参数：模型 / 清晰度 / 质量 / 比例。素材库选择优先于节点缺省值；生成请求 size 实时预览为上方数值。
      </p>
    </div>
  );
}

export default memo(AssetLibraryGenSettings);
