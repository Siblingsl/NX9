import { memo, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Grid3x3, Loader2, X } from 'lucide-react';
import { api } from '../../api/client';
import { cropImageToBlob, defaultCropRect, loadImageElement, type CropRect } from './image-crop';

export type ImageEditMode = 'crop' | 'grid';

interface ImageEditModalProps {
  srcUrl: string;
  onClose: () => void;
  onProduce: (urls: string[]) => void | Promise<void>;
}

export const ImageEditModal = memo(function ImageEditModal({
  srcUrl,
  onClose,
  onProduce,
}: ImageEditModalProps) {
  const [mode, setMode] = useState<ImageEditMode>('crop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 100, h: 100 });
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(srcUrl)
      .then((img) => {
        if (cancelled) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setNatural({ w, h });
        setCrop(defaultCropRect(w, h));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [srcUrl]);

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

  const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div
        className="w-full max-w-3xl rounded-2xl border border-line bg-white shadow-panel overflow-hidden"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface/80">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">图像编辑</span>
            <div className="flex rounded-lg border border-line overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 flex items-center gap-1 ${mode === 'crop' ? 'bg-brand text-white' : 'bg-white text-ink/70'}`}
                onClick={() => setMode('crop')}
              >
                <Crop size={12} /> 裁剪
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 flex items-center gap-1 ${mode === 'grid' ? 'bg-brand text-white' : 'bg-white text-ink/70'}`}
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

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto nx9-scroll">
          <div className="rounded-xl border border-line bg-black/5 p-2 flex justify-center">
            <img src={srcUrl} alt="" className="max-h-64 max-w-full object-contain" />
          </div>

          {mode === 'crop' && natural.w > 0 && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {(['x', 'y', 'w', 'h'] as const).map((key) => (
                <label key={key} className="text-ink/60">
                  {key.toUpperCase()}
                  <input
                    type="number"
                    min={0}
                    max={key === 'x' || key === 'w' ? natural.w : natural.h}
                    value={crop[key]}
                    onChange={(e) =>
                      setCrop((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-line px-2 py-1.5"
                  />
                  <span className="text-[10px] text-ink/40">
                    {pct(crop[key], key === 'x' || key === 'w' ? natural.w : natural.h)}%
                  </span>
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
          <p className="text-[11px] text-ink/50">
            产物不会修改原模块，会在右侧创建独立的结果预览模块（对齐 T8 双击编辑产物逻辑）。
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
