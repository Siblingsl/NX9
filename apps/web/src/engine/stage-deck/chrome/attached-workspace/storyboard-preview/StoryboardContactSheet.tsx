import { useMemo } from 'react';
import {
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  type StoryboardGuideKind,
  type StoryboardPreviewFrame,
  type StoryboardPreviewGridColumns,
  type StoryboardShot,
} from '@nx9/shared';
import { resolveStoryboardBoardMeta } from './storyboard-board-meta';
import { StoryboardGuideOverlayView } from './StoryboardGuideOverlay';
import '../../../../../styles/storyboard-board.css';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardContactSheetProps {
  frames: StoryboardPreviewFrame[];
  columns: StoryboardPreviewGridColumns;
  shotById?: Map<string, StoryboardShot>;
  showGuide?: boolean;
  guideKinds?: readonly StoryboardGuideKind[] | null;
  /** 服务端合成大图（可选，用于下载/新标签打开） */
  composedUrl?: string | null;
  composing?: boolean;
  onSelectFrame?: (frameId: string) => void;
  onOpenComposed?: () => void;
}

/** 关键帧宫格主视图：已出图合成分镜条（含导引叠层） */
export function StoryboardContactSheet({
  frames,
  columns,
  shotById,
  showGuide = true,
  guideKinds = null,
  composedUrl,
  composing,
  onSelectFrame,
  onOpenComposed,
}: StoryboardContactSheetProps) {
  const ready = useMemo(
    () => [...frames].sort((a, b) => a.order - b.order).filter((f) => Boolean(f.imageUrl)),
    [frames],
  );
  const total = frames.length;

  if (ready.length === 0) {
    return (
      <div className="kp-sheet kp-sheet--empty nodrag nopan" onMouseDown={stop}>
        <p className="kp-sheet__title">尚无已出图分镜</p>
        <p className="kp-sheet__hint">
          生成关键帧后，将把已出图的镜头排成宫格分镜条在此展示
          {total > 0 ? `（当前 0/${total}）` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="kp-sheet nodrag nopan" onMouseDown={stop}>
      <div className="kp-sheet__bar">
        <span className="kp-sheet__meta">
          分镜条 · {ready.length}/{total} 已出
          {composing ? ' · 合成备份中…' : ''}
          {showGuide ? ' · 导引开' : ''}
        </span>
        {composedUrl && (
          <button
            type="button"
            className="kp__btn is-ghost"
            title="打开合成大图"
            onMouseDown={stop}
            onClick={() => {
              if (onOpenComposed) onOpenComposed();
              else window.open(composedUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            打开大图
          </button>
        )}
      </div>

      <div className={`kp-sheet__board is-cols-${columns}`}>
        {ready.map((frame) => {
          const shot = shotById?.get(frame.sourceShotId) ?? null;
          const meta = resolveStoryboardBoardMeta(shot, frame);
          const guide = shot
            ? filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(shot), {
                enabled: showGuide,
                kinds: guideKinds,
              })
            : null;
          const hasGuide =
            Boolean(guide && (guide.arrows.length > 0 || guide.marks.length > 0));

          return (
            <button
              key={frame.id}
              type="button"
              className="kp-sheet__cell"
              title={`${meta.index}. ${meta.title}`}
              onMouseDown={stop}
              onClick={() => onSelectFrame?.(frame.id)}
            >
              <div className="kp-sheet__cell-head">
                <span className="kp-sheet__cell-idx">{meta.index}.</span>
                <span className="kp-sheet__cell-title">{meta.title}</span>
              </div>
              <div className="kp-sheet__cell-art">
                <img src={frame.imageUrl!} alt="" draggable={false} />
                {hasGuide && guide && <StoryboardGuideOverlayView overlay={guide} />}
              </div>
              {meta.chips.length > 0 && (
                <div className="kp-sheet__cell-cap">
                  {meta.chips.slice(0, 3).map((chip) => (
                    <span key={`${chip.tone}-${chip.text}`} className={`is-${chip.tone}`}>
                      {chip.text}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
