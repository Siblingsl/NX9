import { Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { StoryboardGuideKind, StoryboardPreviewFrame, StoryboardShot } from '@nx9/shared';
import {
  canRegenerateFrame,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
} from '@nx9/shared';
import { resolveStoryboardBoardMeta } from './storyboard-board-meta';
import { StoryboardGuideOverlayView } from './StoryboardGuideOverlay';
import '../../../../../styles/storyboard-board.css';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const STATUS_LABEL: Record<string, string> = {
  idle: '待出',
  generating: '生成中',
  success: '已出',
  error: '失败',
  modified: '已改',
  locked: '锁定',
};

const STATUS_CLASS: Record<string, string> = {
  idle: 'bg-black/40 text-white/85',
  generating: 'bg-brand/85 text-white animate-pulse',
  success: 'bg-ok/85 text-white',
  error: 'bg-warn/90 text-white',
  modified: 'bg-amber-600/90 text-white',
  locked: 'bg-violet-700/90 text-white',
};

export interface StoryboardPreviewFrameCardProps {
  frame: StoryboardPreviewFrame;
  shot?: StoryboardShot | null;
  selected?: boolean;
  checked?: boolean;
  /** 是否叠导引箭头（默认 true） */
  showGuide?: boolean;
  /** 显示的导引 kind；未传 = 全部 */
  guideKinds?: readonly StoryboardGuideKind[] | null;
  onSelect: () => void;
  onToggleSelect?: () => void;
  onToggleLock: () => void;
  onRegenerate: () => void;
  onInsertAfter: () => void;
  onRemove: () => void;
}

export function StoryboardPreviewFrameCard({
  frame,
  shot,
  selected,
  checked,
  showGuide = true,
  guideKinds = null,
  onSelect,
  onToggleSelect,
  onToggleLock,
  onRegenerate,
  onInsertAfter,
  onRemove,
}: StoryboardPreviewFrameCardProps) {
  const canRegen = canRegenerateFrame(frame);
  const meta = resolveStoryboardBoardMeta(shot, frame);
  const guide = shot
    ? filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(shot), {
        enabled: showGuide,
        kinds: guideKinds,
      })
    : null;
  const showStatus = frame.status !== 'success' || frame.locked;
  const hasCap = meta.chips.length > 0 || Boolean(meta.body) || Boolean(frame.director3dGuide);

  return (
    <div
      className={`sb-cell nodrag nopan ${selected ? 'is-selected' : ''} ${checked ? 'is-checked' : ''} ${
        frame.locked ? 'is-locked' : ''
      }`}
      onMouseDown={stop}
      onClick={onSelect}
    >
      <div className="sb-cell__frame">
        <div className="sb-cell__head">
          <span className="sb-cell__index">{meta.index}.</span>
          <span className="sb-cell__title" title={meta.title}>
            {meta.title}
          </span>
        </div>

        <div className="sb-cell__art">
          {onToggleSelect && (
            <button
              type="button"
              className={`sb-cell__check ${checked ? 'is-on' : ''}`}
              onMouseDown={stop}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
            >
              ✓
            </button>
          )}

          {frame.imageUrl ? (
            <img src={frame.imageUrl} alt="" draggable={false} />
          ) : (
            <div className="sb-cell__art-empty">待生成</div>
          )}

          {frame.imageUrl && guide && (guide.arrows.length > 0 || guide.marks.length > 0) && (
            <StoryboardGuideOverlayView overlay={guide} />
          )}

          {meta.dialogue && !guide?.marks.some((m) => m.kind === 'emotion') && (
            <div className="sb-cell__bubble is-tr" title={meta.dialogue}>
              {meta.dialogue.length > 48 ? `${meta.dialogue.slice(0, 48)}…` : meta.dialogue}
            </div>
          )}

          {showStatus && (
            <span className={`sb-cell__status ${STATUS_CLASS[frame.status] ?? STATUS_CLASS.idle}`}>
              {frame.locked ? '锁定' : STATUS_LABEL[frame.status] ?? frame.status}
            </span>
          )}

          <div className="sb-cell__tools">
            <button
              type="button"
              className={`sb-cell__tool ${frame.locked ? 'is-on' : ''}`}
              title={frame.locked ? '已锁定 · 不会参与重新生成' : '锁定分镜'}
              onMouseDown={stop}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock();
              }}
            >
              <Lock size={11} />
            </button>
          </div>
        </div>
      </div>

      {hasCap && (
        <div className="sb-cell__foot">
          {meta.chips.length > 0 ? (
            <div className="sb-cell__chips">
              {meta.chips.map((chip) => (
                <span key={`${chip.tone}-${chip.text}`} className={`sb-cell__chip is-${chip.tone}`} title={chip.text}>
                  {chip.text}
                </span>
              ))}
            </div>
          ) : (
            meta.body ? <p className="sb-cell__body">{meta.body}</p> : null
          )}
          {meta.chips.length > 0 && meta.body && meta.body !== meta.title && (
            <p className="sb-cell__body">{meta.body}</p>
          )}
          {frame.director3dGuide && (
            <span className="sb-cell__chip is-audio">3D 机位已绑定</span>
          )}
        </div>
      )}

      <div className="sb-cell__actions">
        <button
          type="button"
          className="sb-cell__action"
          disabled={!canRegen}
          title={frame.locked ? '已锁定' : '重新生成此张'}
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
        >
          <RefreshCw size={11} />
        </button>
        <button
          type="button"
          className="sb-cell__action"
          title="插入分镜"
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onInsertAfter();
          }}
        >
          <Plus size={11} />
        </button>
        <button
          type="button"
          className="sb-cell__action is-danger ml-auto"
          disabled={frame.locked}
          title="删除"
          onMouseDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
