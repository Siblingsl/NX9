import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  type StoryboardPreviewPictureSettings,
} from '@nx9/shared';
import { useConnectedPictureModels } from '../../../../../hooks/use-connected-picture-models';
import { ComposerModelSelect } from '../composer/ComposerModelSelect';
import { VideoPopover, PopoverItem } from '../generation/video/VideoPopover';

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
        className={`kp__btn ${open ? 'is-on' : ''}`}
        style={{ padding: '4px 8px', fontSize: 10 }}
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
  hideModel?: boolean;
  modelWidth?: number;
  /** 构图工具条：隐藏「每镜×1」等次要提示，间距更紧 */
  compact?: boolean;
  /** 工具条右侧附加操作（如导出），与参数 chips 同一行 */
  endSlot?: ReactNode;
}

export function StoryboardPreviewGenSettings({
  settings,
  onChange,
  hideModel = false,
  modelWidth = 260,
  compact = false,
  endSlot,
}: StoryboardPreviewGenSettingsProps) {
  const qualityLabel =
    IMAGE_QUALITY_OPTIONS.find((o) => o.id === settings.quality)?.label ?? settings.quality;
  const aspectLabel =
    IMAGE_ASPECT_OPTIONS.find((o) => o.id === settings.aspectRatio)?.label ?? settings.aspectRatio;

  const {
    options: pictureModelOptions,
    hasConnections: hasPictureConnections,
    preferredModel,
    selectModel: selectPictureModel,
    openConnectionsSettings,
  } = useConnectedPictureModels(settings.model);

  useEffect(() => {
    if (!preferredModel || preferredModel === settings.model) return;
    if (!hasPictureConnections) return;
    onChange({ model: preferredModel });
  }, [hasPictureConnections, onChange, preferredModel, settings.model]);

  return (
    <div
      className={`sb-preview-gen shrink-0 flex flex-wrap items-center ${compact ? 'gap-1.5 px-0 py-0' : 'gap-2 px-3 py-1.5'}`}
      onMouseDown={stop}
    >
      {!hideModel && (
        <>
          <ComposerModelSelect
            value={settings.model}
            options={
              pictureModelOptions.length > 0
                ? pictureModelOptions
                : [{ id: settings.model, label: '未配置图片连接 · 点此去设置' }]
            }
            onChange={(model: string) => {
              if (!hasPictureConnections) {
                openConnectionsSettings();
                return;
              }
              void selectPictureModel(model, (id) => onChange({ model: id }));
            }}
            width={modelWidth}
            tone="desk"
          />
        </>
      )}
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
      {!compact ? <span className="kp__hint">每镜 ×1</span> : null}
      {endSlot ? (
        <>
          <span className="kp__toolbar-spacer" style={{ flex: 1, minWidth: 12 }} />
          <div className="sb-preview-gen__end flex items-center gap-2 shrink-0">{endSlot}</div>
        </>
      ) : null}
    </div>
  );
}
