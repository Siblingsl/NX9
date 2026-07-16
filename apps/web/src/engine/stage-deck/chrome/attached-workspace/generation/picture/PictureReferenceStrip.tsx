import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../../../../../../api/client';
import { useUpstreamMedia } from '../use-upstream-media';
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
  blockId: string;
  mode: PictureGenMode;
  referenceImageUrl?: string;
  styleImageUrl?: string;
  referenceImageUrls?: string[];
  excludedRefUrls?: string[];
  onPatch: (patch: Record<string, unknown>) => void;
}

export function PictureReferenceStrip({
  blockId,
  mode,
  referenceImageUrl,
  styleImageUrl,
  referenceImageUrls = [],
  excludedRefUrls = [],
  onPatch,
}: PictureReferenceStripProps) {
  const { pictures } = useUpstreamMedia(blockId);
  const showPrimary = modeNeedsPrimaryRef(mode);
  const showStyle = modeNeedsStyleRef(mode);
  const showMulti = modeAllowsMultiRef(mode);
  const filteredUpstream = pictures.filter((u) => !excludedRefUrls.includes(u));

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

  const toggleExclude = (url: string) => {
    if (excludedRefUrls.includes(url)) {
      onPatch({ excludedRefUrls: excludedRefUrls.filter((u) => u !== url) });
    } else {
      onPatch({ excludedRefUrls: [...excludedRefUrls, url] });
    }
  };

  const useUpstreamAsPrimary = (url: string) => {
    setPrimary(url);
  };

  return (
    <div
      className="shrink-0 flex flex-col gap-2 px-3 pt-2.5 pb-2 border-b border-line/25 nodrag nopan"
      onMouseDown={stop}
    >
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
        {!showPrimary && !showStyle && !showMulti && filteredUpstream.length === 0 && (
          <p className="text-[10px] text-ink/40 py-2">连接上游图像或切换到图生图模式以添加参考</p>
        )}

        {filteredUpstream.map((url, i) => {
          const active = referenceImageUrl === url;
          return (
            <button
              key={`${url}-${i}`}
              type="button"
              onMouseDown={stop}
              onClick={() => useUpstreamAsPrimary(url)}
              className={`relative w-14 h-14 rounded-xl overflow-hidden border shrink-0 transition-all ${
                active
                  ? 'border-brand/50 ring-1 ring-brand/25'
                  : 'border-line/45 hover:border-brand/30'
              }`}
              title="点击设为主体参考"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent text-white text-[8px] text-center py-0.5">
                上游
              </span>
              <button
                type="button"
                onMouseDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExclude(url);
                }}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-ink/50 text-white opacity-0 hover:opacity-100 focus:opacity-100"
                title="排除此上游图"
              >
                <X size={9} />
              </button>
            </button>
          );
        })}

        {excludedRefUrls.length > 0 && (
          <button
            type="button"
            onMouseDown={stop}
            onClick={() => onPatch({ excludedRefUrls: [] })}
            className="text-[9px] text-ink/40 hover:text-brand shrink-0 px-1"
          >
            恢复已排除 ({excludedRefUrls.length})
          </button>
        )}
      </div>
    </div>
  );
}
