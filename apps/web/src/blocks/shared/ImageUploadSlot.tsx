import { memo, useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../../api/client';

interface ImageUploadSlotProps {
  url?: string;
  label: string;
  aspectClass?: string;
  onUploaded: (url: string) => void;
  onClear?: () => void;
  compact?: boolean;
}

function ImageUploadSlot({
  url,
  label,
  aspectClass = 'aspect-[3/4]',
  onUploaded,
  onClear,
  compact,
}: ImageUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
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
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`relative w-full ${aspectClass} rounded-lg border overflow-hidden nodrag nopan transition-colors ${
          url ? 'border-line' : 'border-dashed border-line bg-surface hover:border-brand/40 hover:bg-brand/[0.02]'
        } ${uploading ? 'opacity-60' : ''}`}
      >
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink/35 px-1">
            <Upload size={compact ? 14 : 18} />
            <span className={compact ? 'text-[9px]' : 'text-[10px]'}>{uploading ? '上传中…' : label}</span>
          </span>
        )}
      </button>
      {url && (
        <div className="mt-0.5 flex justify-center gap-2 text-[9px]">
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
    </div>
  );
}

export default memo(ImageUploadSlot);
