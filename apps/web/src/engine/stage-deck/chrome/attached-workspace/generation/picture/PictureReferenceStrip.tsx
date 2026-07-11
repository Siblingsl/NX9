import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../../../../../../api/client';
import { useUpstreamMedia } from '../use-upstream-media';
import type { PictureGenMode } from './picture-gen-modes';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function UploadSlot({
  label,
  url,
  onChange,
}: {
  label: string;
  url?: string;
  onChange: (url: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const res = await api.uploadAsset(file);
        onChange(res.url);
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 nodrag nopan">
      {url ? (
        <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-line/45 group">
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => onChange(undefined)}
            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-ink/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onMouseDown={stop}
          onClick={() => inputRef.current?.click()}
          className="w-14 h-14 rounded-xl border border-dashed border-line/50 bg-surface/30 flex flex-col items-center justify-center gap-0.5 hover:border-brand/30 hover:bg-brand/[0.03] transition-colors disabled:opacity-50"
        >
          <ImagePlus size={15} className="text-ink/30" />
          <span className="text-[9px] text-ink/40">{busy ? '…' : label}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export interface PictureReferenceStripProps {
  blockId: string;
  mode: PictureGenMode;
  referenceImageUrl?: string;
  onReferenceChange: (url: string | undefined) => void;
}

export function PictureReferenceStrip({
  blockId,
  mode,
  referenceImageUrl,
  onReferenceChange,
}: PictureReferenceStripProps) {
  const { pictures } = useUpstreamMedia(blockId);
  const showUpload = mode === 'image-to-image';

  return (
    <div
      className="shrink-0 flex items-center gap-3 px-3 pt-2.5 pb-2 border-b border-line/25 nodrag nopan overflow-x-auto nx9-scroll"
      onMouseDown={stop}
    >
      {pictures.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative w-14 h-14 rounded-xl overflow-hidden border border-line/45 shrink-0"
        >
          <img src={url} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/65 to-transparent text-white text-[8px] text-center py-0.5">
            上游
          </span>
        </div>
      ))}
      {showUpload && (
        <UploadSlot label="参考图" url={referenceImageUrl} onChange={onReferenceChange} />
      )}
    </div>
  );
}
