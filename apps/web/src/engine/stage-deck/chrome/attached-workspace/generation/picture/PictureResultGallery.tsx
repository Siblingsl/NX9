import { useState } from 'react';
import { Expand, ImageOff } from 'lucide-react';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface PictureResultGalleryProps {
  urls: string[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  emptyHint?: string;
}

/** 工作区内结果画廊 — 多图缩略 + 选中预览 */
export function PictureResultGallery({
  urls,
  selectedIndex = 0,
  onSelect,
  emptyHint = '生成结果将显示在这里',
}: PictureResultGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const active = urls[selectedIndex] ?? urls[0];

  if (urls.length === 0) {
    return (
      <div
        className="mx-3 mt-2 rounded-xl border border-dashed border-line/40 bg-surface/40 flex flex-col items-center justify-center gap-1.5 py-6 text-ink/35"
        onMouseDown={stop}
      >
        <ImageOff size={18} strokeWidth={1.5} />
        <span className="text-[10px]">{emptyHint}</span>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 space-y-2 nodrag nopan" onMouseDown={stop}>
      <div className="relative rounded-xl overflow-hidden border border-line/35 bg-surface/50 aspect-[16/9] max-h-[160px]">
        <img src={active} alt="" className="w-full h-full object-contain bg-[#0c0e12]/[0.04]" />
        <button
          type="button"
          onClick={() => setLightbox(active)}
          className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-ink/50 text-white hover:bg-ink/70"
          title="放大"
        >
          <Expand size={12} />
        </button>
        {urls.length > 1 && (
          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-ink/55 text-white text-[9px] tabular-nums">
            {selectedIndex + 1}/{urls.length}
          </span>
        )}
      </div>
      {urls.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto nx9-scroll pb-0.5">
          {urls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => onSelect?.(i)}
              className={`w-11 h-11 rounded-lg overflow-hidden border shrink-0 transition-all ${
                i === selectedIndex
                  ? 'border-brand/50 ring-1 ring-brand/25'
                  : 'border-line/40 hover:border-brand/30'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/70 p-6"
          onClick={() => setLightbox(null)}
          onMouseDown={stop}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
