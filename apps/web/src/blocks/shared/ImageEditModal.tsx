import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Grid3x3, Loader2, X } from 'lucide-react';
import { api } from '../../api/client';
import { cropImageToBlob, defaultCropRect, loadImageElement, type CropRect } from './image-crop';

export type ImageEditMode = 'crop' | 'grid';

type CropDragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type CropDrag = {
  mode: CropDragMode;
  startX: number;
  startY: number;
  crop: CropRect;
};

interface ImageEditModalProps {
  srcUrl: string;
  onClose: () => void;
  onProduce: (urls: string[]) => void | Promise<void>;
  /** 自动裁剪区域，用户可在弹窗内继续调整。 */
  initialRect?: [number, number, number, number];
  title?: string;
}

export const ImageEditModal = memo(function ImageEditModal({
  srcUrl,
  onClose,
  onProduce,
  initialRect,
  title = '图像编辑',
}: ImageEditModalProps) {
  const [mode, setMode] = useState<ImageEditMode>('crop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const imageRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<CropDrag | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(srcUrl)
      .then((img) => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNatural({ w, h });
        if (initialRect) {
          const [x, y, width, height] = initialRect;
          setCrop({
            x: Math.round(x * w),
            y: Math.round(y * h),
            w: Math.max(1, Math.round(width * w)),
            h: Math.max(1, Math.round(height * h)),
          });
        } else {
          setCrop(defaultCropRect(w, h));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [srcUrl, initialRect]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => {
      const image = imageRef.current;
      if (!image || !natural.w || !natural.h) return;
      const bounds = image.getBoundingClientRect();
      const dx = ((event.clientX - drag.startX) / bounds.width) * natural.w;
      const dy = ((event.clientY - drag.startY) / bounds.height) * natural.h;
      const minSize = Math.max(8, Math.round(Math.min(natural.w, natural.h) * 0.03));
      const start = drag.crop;
      let next = start;
      if (drag.mode === 'move') {
        next = {
          ...start,
          x: Math.max(0, Math.min(natural.w - start.w, start.x + dx)),
          y: Math.max(0, Math.min(natural.h - start.h, start.y + dy)),
        };
      } else {
        let left = start.x;
        let top = start.y;
        let right = start.x + start.w;
        let bottom = start.y + start.h;
        if (drag.mode.includes('w')) left = Math.max(0, Math.min(right - minSize, start.x + dx));
        if (drag.mode.includes('e')) right = Math.min(natural.w, Math.max(left + minSize, start.x + start.w + dx));
        if (drag.mode.includes('n')) top = Math.max(0, Math.min(bottom - minSize, start.y + dy));
        if (drag.mode.includes('s')) bottom = Math.min(natural.h, Math.max(top + minSize, start.y + start.h + dy));
        next = { x: left, y: top, w: right - left, h: bottom - top };
      }
      setCrop(next);
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, natural]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const uploadBlob = useCallback(async (blob: Blob, name: string) => {
    const file = new File([blob], name, { type: blob.type || 'image/png' });
    const res = await api.uploadAsset(file);
    return res.url;
  }, []);

  const runCrop = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const blob = await cropImageToBlob(srcUrl, crop);
      const url = await uploadBlob(blob, 'crop.png');
      await onProduce([url]);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [srcUrl, crop, uploadBlob, onProduce, onClose]);

  const runGrid = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.gridSplit({ sourceUrl: srcUrl, rows, cols });
      if (!res.urls?.length) throw new Error('宫格切分未返回图片');
      await onProduce(res.urls);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [srcUrl, rows, cols, onProduce, onClose]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: CropDragMode) => {
    if (mode === 'move') event.preventDefault();
    setDrag({ mode, startX: event.clientX, startY: event.clientY, crop });
  };

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/45 p-4">
      <div
        className="w-full max-w-4xl rounded-2xl border border-line bg-surface shadow-panel overflow-hidden"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface/80">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{title}</span>
            <div className="flex rounded-lg border border-line overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 flex items-center gap-1 ${mode === 'crop' ? 'bg-brand text-white' : 'bg-surface text-ink/70'}`}
                onClick={() => setMode('crop')}
              >
                <Crop size={12} /> 裁剪
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 flex items-center gap-1 ${mode === 'grid' ? 'bg-brand text-white' : 'bg-surface text-ink/70'}`}
                onClick={() => setMode('grid')}
              >
                <Grid3x3 size={12} /> 宫格切分
              </button>
            </div>
          </div>
          <button type="button" className="p-1 rounded-lg hover:bg-black/5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-3 max-h-[78vh] overflow-y-auto nx9-scroll">
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-line bg-surface/70 p-3">
            <div className="relative inline-block max-w-full leading-none">
              <img ref={imageRef} src={srcUrl} alt="" className="block max-h-[55vh] max-w-full object-contain" />
              {mode === 'crop' && natural.w > 0 ? (
                <div
                  className="absolute border-2 border-brand bg-brand/10 shadow-[0_0_0_9999px_rgb(15_23_42_/_0.28)] touch-none cursor-move"
                  style={{
                    left: `${(crop.x / natural.w) * 100}%`,
                    top: `${(crop.y / natural.h) * 100}%`,
                    width: `${(crop.w / natural.w) * 100}%`,
                    height: `${(crop.h / natural.h) * 100}%`,
                  }}
                  onPointerDown={(event) => beginDrag(event, 'move')}
                >
                  {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                    <span
                      key={handle}
                      className={`absolute h-3 w-3 rounded-sm border border-white bg-brand shadow ${
                        handle === 'nw' ? '-left-1.5 -top-1.5 cursor-nwse-resize' :
                          handle === 'ne' ? '-right-1.5 -top-1.5 cursor-nesw-resize' :
                            handle === 'sw' ? '-bottom-1.5 -left-1.5 cursor-nesw-resize' : '-bottom-1.5 -right-1.5 cursor-nwse-resize'
                      }`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        beginDrag(event, handle);
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {mode === 'crop' && natural.w > 0 && (
            <div className="grid grid-cols-4 gap-2 rounded-lg border border-line bg-surface/50 p-2 text-[10px]">
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <label key={key} className="text-ink/50">
                  <span className="mr-1 uppercase">{key}</span>
                  <input
                    type="number"
                    min={0}
                    max={key === 'x' || key === 'w' ? natural.w : natural.h}
                    value={crop[key]}
                    onChange={(e) => setCrop((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                  />
                </label>
              ))}
            </div>
          )}

          {mode === 'grid' && (
            <div className="flex gap-3">
              <label className="text-xs text-ink/60 flex-1">
                行
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-line px-2 py-1.5"
                />
              </label>
              <label className="text-xs text-ink/60 flex-1">
                列
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-line px-2 py-1.5"
                />
              </label>
            </div>
          )}

          {error && <p className="text-xs text-warn">{error}</p>}
          <p className="text-[10px] text-ink/45">
            可拖动裁剪框整体移动，拖动四角调整范围；下方 X/Y/W/H 可精确修正。
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line bg-surface/50">
          <button type="button" className="px-3 py-2 text-sm rounded-xl border border-line" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className="px-4 py-2 text-sm rounded-xl bg-brand text-white disabled:opacity-50 flex items-center gap-2"
            onClick={() => void (mode === 'crop' ? runCrop() : runGrid())}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === 'crop' ? '应用裁剪' : '切分并生成'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
