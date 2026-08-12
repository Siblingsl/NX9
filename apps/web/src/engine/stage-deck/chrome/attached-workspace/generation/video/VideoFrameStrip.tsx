import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../../../../../../api/client';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function FrameSlot({
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

export type VideoFrameStripSlot = 'start' | 'end' | 'ref';

export interface VideoFrameStripProps {
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceFrameUrl?: string;
  onStartChange: (url: string | undefined) => void;
  onEndChange: (url: string | undefined) => void;
  onReferenceChange: (url: string | undefined) => void;
  /** VG-20: 按模式显示槽位；缺省三槽（兼容旧调用） */
  slots?: VideoFrameStripSlot[];
  hint?: string;
}

export function VideoFrameStrip({
  startFrameUrl,
  endFrameUrl,
  referenceFrameUrl,
  onStartChange,
  onEndChange,
  onReferenceChange,
  slots = ['start', 'end', 'ref'],
  hint,
}: VideoFrameStripProps) {
  const showStart = slots.includes('start');
  const showEnd = slots.includes('end');
  const showRef = slots.includes('ref');
  return (
    <div
      className="shrink-0 flex items-center gap-3 px-3 pt-2.5 pb-2 border-b border-line/25 nodrag nopan"
      onMouseDown={stop}
    >
      {showStart && <FrameSlot label="首图" url={startFrameUrl} onChange={onStartChange} />}
      {showEnd && <FrameSlot label="尾图" url={endFrameUrl} onChange={onEndChange} />}
      {showRef && <FrameSlot label="Ref" url={referenceFrameUrl} onChange={onReferenceChange} />}
      {hint ? <p className="text-[9px] text-ink/40 leading-snug max-w-[160px]">{hint}</p> : null}
    </div>
  );
}

function ClipSlot({
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
        <div className="relative w-20 h-14 rounded-xl overflow-hidden border border-line/45 group bg-ink/80">
          <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
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
          className="w-20 h-14 rounded-xl border border-dashed border-line/50 bg-surface/30 flex flex-col items-center justify-center gap-0.5 hover:border-brand/30 hover:bg-brand/[0.03] transition-colors disabled:opacity-50"
        >
          <ImagePlus size={15} className="text-ink/30" />
          <span className="text-[9px] text-ink/40">{busy ? '…' : label}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
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

/** VG-21: Bridge 源视频槽 */
export function VideoSourceStrip({
  sourceClipUrl,
  upstreamClips,
  onChange,
}: {
  sourceClipUrl?: string;
  upstreamClips?: string[];
  onChange: (url: string | undefined) => void;
}) {
  const extras = (upstreamClips ?? []).filter((u) => u && u !== sourceClipUrl);
  return (
    <div
      className="shrink-0 flex items-center gap-3 px-3 pt-2.5 pb-2 border-b border-line/25 nodrag nopan"
      onMouseDown={stop}
    >
      <ClipSlot label="源视频" url={sourceClipUrl} onChange={onChange} />
      <p className="text-[9px] text-ink/40 leading-snug max-w-[180px]">
        Bridge 续拍需要源片：上传或点选上游视频，将抽尾帧续拍。
      </p>
      {extras.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {extras.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onMouseDown={stop}
              onClick={() => onChange(url)}
              className="w-14 h-10 rounded-lg overflow-hidden border border-line/40 hover:border-brand/40"
              title={`使用上游视频 ${i + 1}`}
            >
              <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
