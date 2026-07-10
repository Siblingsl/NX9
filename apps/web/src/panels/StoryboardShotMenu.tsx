import { createPortal } from 'react-dom';
import { Box, Check, Clapperboard, MapPin, Pencil, RefreshCw, Sparkles, Trash2, Upload, Video, XCircle } from 'lucide-react';
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
  onAiSketch?: (shotId: string) => void;
  onUploadSketch?: (shotId: string) => void;
  onSpawnSketchPad?: (shotId: string) => void;
  onSpawnDirector3d?: (shotId: string) => void;
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
  onAiSketch,
  onUploadSketch,
  onSpawnSketchPad,
  onSpawnDirector3d,
}: StoryboardShotMenuProps) {
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 280);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="nx9-context-menu fixed z-50"
        style={{ left, top, width: 220 }}
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
        <div className="nx9-context-menu__divider" />
        {onUploadSketch && (
          <button type="button" className="nx9-context-menu__item" onClick={() => { onUploadSketch(shot.id); onClose(); }}>
            <Upload size={13} /> 上传线稿
          </button>
        )}
        {onAiSketch && (
          <button type="button" className="nx9-context-menu__item" onClick={() => { onAiSketch(shot.id); onClose(); }}>
            <Sparkles size={13} /> AI 生成线稿
          </button>
        )}
        {onSpawnSketchPad && (
          <button type="button" className="nx9-context-menu__item" onClick={() => { onSpawnSketchPad(shot.id); onClose(); }}>
            <Pencil size={13} /> 手绘分镜
          </button>
        )}
        {onSpawnDirector3d && (
          <button type="button" className="nx9-context-menu__item" onClick={() => { onSpawnDirector3d(shot.id); onClose(); }}>
            <Box size={13} /> 3D 预演
          </button>
        )}
        <div className="nx9-context-menu__divider" />
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
