import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../../../../../../api/client';
import {
  modeAllowsMultiRef,
  modeNeedsPrimaryRef,
  modeNeedsStyleRef,
  type PictureGenMode,
} from './picture-gen-modes';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function UploadSlot({
  label,
  url,
  onChange,
  accent,
}: {
  label: string;
  url?: string;
  onChange: (url: string | undefined) => void;
  accent?: boolean;
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
        <div
          className={`relative w-14 h-14 rounded-xl overflow-hidden border group ${
            accent ? 'border-brand/40 ring-1 ring-brand/20' : 'border-line/45'
          }`}
        >
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
          className={`w-14 h-14 rounded-xl border border-dashed bg-surface/30 flex flex-col items-center justify-center gap-0.5 hover:border-brand/30 hover:bg-brand/[0.03] transition-colors disabled:opacity-50 ${
            accent ? 'border-brand/35' : 'border-line/50'
          }`}
        >
          <ImagePlus size={15} className="text-ink/30" />
          <span className="text-[9px] text-ink/40">{busy ? '…' : label}</span>
        </button>
      )}
      <span className="text-[9px] text-ink/40 max-w-[56px] truncate text-center">{label}</span>
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
  mode: PictureGenMode;
  referenceImageUrl?: string;
  styleImageUrl?: string;
  referenceImageUrls?: string[];
  onPatch: (patch: Record<string, unknown>) => void;
}

/** 仅手动上传参考槽；上游图由 PictureUpstreamStrip 独立展示，避免混区 */
export function PictureReferenceStrip({
  mode,
  referenceImageUrl,
  styleImageUrl,
  referenceImageUrls = [],
  onPatch,
}: PictureReferenceStripProps) {
  const showPrimary = modeNeedsPrimaryRef(mode);
  const showStyle = modeNeedsStyleRef(mode);
  const showMulti = modeAllowsMultiRef(mode);

  if (!showPrimary && !showStyle && !showMulti) return null;

  const setPrimary = (url: string | undefined) => {
    onPatch({ referenceImageUrl: url });
  };

  const setStyle = (url: string | undefined) => {
    onPatch({ styleImageUrl: url });
  };

  const setMultiAt = (index: number, url: string | undefined) => {
    const next = [...referenceImageUrls];
    while (next.length < 3) next.push('');
    if (url) next[index] = url;
    else next[index] = '';
    onPatch({ referenceImageUrls: next.filter(Boolean) });
  };

  return (
    <div
      className="mx-3 mt-1.5 rounded-xl border border-line/30 bg-surface/25 px-2.5 py-2 nodrag nopan"
      onMouseDown={stop}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[9px] font-medium text-ink/55 tracking-wide">手动参考</span>
      </div>
      <div className="flex items-center gap-3 overflow-x-auto nx9-scroll pb-0.5">
        {showPrimary && (
          <UploadSlot
            label="主体参考"
            url={referenceImageUrl}
            onChange={setPrimary}
            accent
          />
        )}
        {showStyle && (
          <UploadSlot label="风格参考" url={styleImageUrl} onChange={setStyle} />
        )}
        {showMulti &&
          [0, 1, 2].map((i) => (
            <UploadSlot
              key={i}
              label={i === 0 ? '参考 2' : i === 1 ? '参考 3' : '参考 4'}
              url={referenceImageUrls[i]}
              onChange={(url) => setMultiAt(i, url)}
            />
          ))}
      </div>
    </div>
  );
}
