import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { type NodeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import './media-pin.css';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function PinLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return createPortal(
    <div className="nx9-media-pin-lightbox" onClick={onClose} onPointerDown={stop}>
      <button type="button" className="nx9-media-pin-lightbox__close" onClick={onClose} aria-label="关闭">
        <X size={16} />
      </button>
      <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

function MediaPinBlock(props: NodeProps) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  const url =
    (data.pinUrl as string | undefined) ||
    (data.previewUrl as string | undefined) ||
    (data.assetUrl as string | undefined) ||
    '';
  const [lightbox, setLightbox] = useState(false);

  return (
    <BlockShell {...props}>
      <div className="nx9-media-pin">
        <button
          type="button"
          className="nx9-media-pin__frame"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (url) setLightbox(true);
          }}
          title="双击放大"
        >
          {url ? (
            <img src={url} alt="" draggable={false} className="nx9-media-pin__img" />
          ) : (
            <div className="nx9-media-pin__empty">无图像</div>
          )}
        </button>
      </div>
      {lightbox && url ? <PinLightbox url={url} onClose={() => setLightbox(false)} /> : null}
    </BlockShell>
  );
}

export default memo(MediaPinBlock);
