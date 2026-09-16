/**
 * 出图尺寸预设 chip（增量新增）。
 *
 * 词表：`@nx9/shared` 的 `PICTURE_GEN_SIZES`
 * （源码 `packages/shared/src/data/gen-models.ts`，原本没有前端入口）。
 *
 * 落库约定：**不新增持久化字段名**。选中一项即写入既有的
 * `aspectRatio: 'custom'` + `width` / `height` 三个字段，
 * 与既有尺寸控件（`PictureParamChips` 的宽高比 chip、高级面板的自定义 W/H 输入）
 * 同源同字段；`resolveImageRequestSize` 作为唯一消费方照旧解析，行为不变。
 *
 * 因此本 chip 上显示的「当前尺寸」是**由既有字段反查**得出，不是独立状态：
 * 用户改用宽高比 chip 或手改 W/H 后，这里会自动显示不命中预设 / 命中的那一项。
 */
import { useRef, useState } from 'react';
import {
  PICTURE_SIZE_PRESET_OPTIONS,
  matchPictureGenSize,
  pictureSizePresetPatch,
} from '@nx9/shared';
import { VideoPopover, PopoverItem } from '../video/VideoPopover';
import { useAttachedNodeData } from '../use-attached-node-data';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureSizePresetChipProps {
  blockId: string;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function PictureSizePresetChip({ blockId, onPatch }: PictureSizePresetChipProps) {
  const data = useAttachedNodeData(blockId);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const width = typeof data.width === 'number' ? data.width : undefined;
  const height = typeof data.height === 'number' ? data.height : undefined;
  const aspectRatio = (data.aspectRatio as string) ?? '1:1';

  // 只在「自定义宽高」口径下反查预设，避免与宽高比 chip 抢显示语义
  const matchedId = aspectRatio === 'custom' ? matchPictureGenSize(width, height) : undefined;
  const matched = PICTURE_SIZE_PRESET_OPTIONS.find((o) => o.id === matchedId);
  const label = matched ? matched.label : '尺寸预设';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        title="出图尺寸预设：写入既有 aspectRatio=custom + width/height，与宽高比控件同源"
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] transition-colors ${
          open || matched ? 'bg-brand/10 text-brand' : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        }`}
      >
        {label}
      </button>
      <VideoPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        width={168}
        tone="desk"
      >
        {PICTURE_SIZE_PRESET_OPTIONS.map((o) => (
          <PopoverItem
            key={o.id}
            active={o.id === matchedId}
            onClick={() => {
              const patch = pictureSizePresetPatch(o.id);
              if (patch) onPatch({ ...patch });
              setOpen(false);
            }}
          >
            {o.label}
            <span className="ml-1 text-[9px] text-ink/35">{o.id}</span>
          </PopoverItem>
        ))}
      </VideoPopover>
    </>
  );
}
