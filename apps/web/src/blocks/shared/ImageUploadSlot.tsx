import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Upload, ZoomIn } from 'lucide-react';
import { api } from '../../api/client';
import { ImageLightbox, type ImageLightboxItem } from '../../components/ui/ImageLightbox';

interface ImageUploadSlotProps {
  url?: string;
  label: string;
  aspectClass?: string;
  onUploaded: (url: string) => void;
  onClear?: () => void;
  compact?: boolean;
  accept?: string;
  /** 放大图集；不传则仅当前图 */
  gallery?: ImageLightboxItem[];
}

function ImageUploadSlot({
  url,
  label,
  aspectClass = 'aspect-[3/4]',
  onUploaded,
  onClear,
  compact,
  accept = 'image/*',
  gallery,
}: ImageUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isAudio = accept.startsWith('audio');
  const isImage = Boolean(url && !isAudio);
  const items = useMemo<ImageLightboxItem[]>(() => {
    if (gallery?.length) return gallery.filter((g) => g.url);
    if (url && isImage) return [{ url, label }];
    return [];
  }, [gallery, url, isImage, label]);
  const startIndex = Math.max(0, items.findIndex((g) => g.url === url));

  const onFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const res = await api.uploadAsset(file);
        onUploaded(res.url);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [onUploaded],
  );

  return (
    <div className="text-center">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <div
        className={`relative w-full ${aspectClass} rounded-lg border overflow-hidden nodrag nopan transition-colors ${
          url ? 'border-line' : 'border-dashed border-line bg-surface hover:border-brand/40 hover:bg-brand/[0.02]'
        } ${uploading ? 'opacity-60' : ''}`}
      >
        {url ? (
          isAudio ? (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center text-ink/50 text-[10px] px-1"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              音频已上传
            </button>
          ) : (
            <button
              type="button"
              className="group absolute inset-0"
              onClick={() => setPreviewOpen(true)}
              title={`放大查看：${label}`}
              disabled={uploading}
            >
              <img src={url} alt={label} className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                <ZoomIn size={compact ? 14 : 18} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
              </span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink/35 px-1"
          >
            <Upload size={compact ? 14 : 18} />
            <span className={compact ? 'text-[9px]' : 'text-[10px]'}>{uploading ? '上传中…' : label}</span>
          </button>
        )}
      </div>
      {url && (
        <div className="mt-0.5 flex justify-center gap-2 text-[9px]">
          {isImage ? (
            <button type="button" className="text-ink/55 nodrag nopan hover:text-brand" onClick={() => setPreviewOpen(true)}>
              放大
            </button>
          ) : null}
          <button type="button" className="text-brand nodrag nopan" onClick={() => inputRef.current?.click()}>
            更换
          </button>
          {onClear && (
            <button type="button" className="text-ink/40 nodrag nopan" onClick={onClear}>
              清除
            </button>
          )}
        </div>
      )}
      <ImageLightbox
        open={previewOpen}
        items={items}
        index={startIndex < 0 ? 0 : startIndex}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

export default memo(ImageUploadSlot);
