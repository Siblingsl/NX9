import { createPortal } from 'react-dom';
import { Check, Clapperboard, MapPin, RefreshCw, Trash2, Video, XCircle } from 'lucide-react';
import type { StoryboardShot } from '@nx9/shared';

interface StoryboardShotMenuProps {
  x: number;
  y: number;
  shot: StoryboardShot;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onLocate: () => void;
  onRegenerate: (kind: string) => void;
  onDelete: () => void;
}

export function StoryboardShotMenu({
  x,
  y,
  shot,
  onClose,
  onApprove,
  onReject,
  onLocate,
  onRegenerate,
  onDelete,
}: StoryboardShotMenuProps) {
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 280);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="nx9-context-menu fixed z-50"
        style={{ left, top, width: 200 }}
      >
        <div className="nx9-context-menu__header">镜头 #{shot.index}</div>
        {shot.status === 'review' && (
          <>
            <button type="button" className="nx9-context-menu__item" onClick={() => { onApprove(); onClose(); }}>
              <Check size={13} /> 通过审阅
            </button>
            <button type="button" className="nx9-context-menu__item" onClick={() => { onReject(); onClose(); }}>
              <XCircle size={13} /> 打回
            </button>
          </>
        )}
        <button type="button" className="nx9-context-menu__item" onClick={() => { onLocate(); onClose(); }}>
          <MapPin size={13} /> 在画布定位
        </button>
        <button type="button" className="nx9-context-menu__item" onClick={() => { onRegenerate('picture-gen'); onClose(); }}>
          <RefreshCw size={13} /> 重新生成首帧
        </button>
        <button type="button" className="nx9-context-menu__item" onClick={() => { onRegenerate('clip-gen'); onClose(); }}>
          <Video size={13} /> 重新生成视频
        </button>
        <button type="button" className="nx9-context-menu__item" onClick={() => { onRegenerate('sound-gen'); onClose(); }}>
          <Clapperboard size={13} /> 重新生成配音
        </button>
        <button
          type="button"
          className="nx9-context-menu__item nx9-context-menu__item--danger"
          onClick={() => { onDelete(); onClose(); }}
        >
          <Trash2 size={13} /> 删除镜头
        </button>
      </div>
    </>,
    document.body,
  );
}
