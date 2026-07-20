import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Copy, RefreshCw, ZoomIn } from 'lucide-react';
import { ImageLightbox, type ImageLightboxItem } from '../../components/ui/ImageLightbox';

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 pt-3 border-t border-line/70 first:border-t-0 first:pt-0">
      <h4 className="text-[11px] font-semibold text-ink/55 uppercase tracking-wide">{title}</h4>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-ink/45 mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full text-xs rounded-lg border border-line px-2 py-1.5 focus:outline-none focus:border-brand/40 ${className}`}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full text-xs rounded-lg border border-line px-2 py-1.5 resize-y focus:outline-none focus:border-brand/40 ${mono ? 'font-mono' : ''}`}
    />
  );
}

export function PromptPanel({
  label,
  value,
  negative,
  onChange,
  onChangeNegative,
  onRegenerate,
  onCopy,
}: {
  label: string;
  value: string;
  negative?: string;
  onChange: (v: string) => void;
  onChangeNegative?: (v: string) => void;
  onRegenerate?: () => void;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface/30 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-ink/55">{label}</span>
        <div className="flex gap-1">
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex items-center gap-0.5 text-[10px] text-brand/80 hover:text-brand px-1.5 py-0.5 rounded"
            >
              <RefreshCw size={10} />
              重新生成
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-0.5 text-[10px] text-ink/45 hover:text-ink px-1.5 py-0.5 rounded"
            >
              <Copy size={10} />
              复制
            </button>
          )}
        </div>
      </div>
      <TextArea value={value} onChange={onChange} rows={4} mono />
      {onChangeNegative && (
        <Field label="Negative Prompt">
          <TextArea value={negative ?? ''} onChange={onChangeNegative} rows={2} mono />
        </Field>
      )}
    </div>
  );
}

export function MediaSlot({
  label,
  url,
  accept,
  onUpload,
  hint,
  gallery,
}: {
  label: string;
  url?: string | null;
  accept: string;
  onUpload: (file: File) => void;
  hint?: string;
  /** 放大时的图集（含当前图）；不传则仅当前图 */
  gallery?: ImageLightboxItem[];
}) {
  const [open, setOpen] = useState(false);
  const isImage = Boolean(url && !/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url));
  const items = useMemo<ImageLightboxItem[]>(() => {
    if (gallery && gallery.length > 0) return gallery.filter((g) => g.url);
    if (url && isImage) return [{ url, label }];
    return [];
  }, [gallery, url, isImage, label]);
  const startIndex = Math.max(0, items.findIndex((g) => g.url === url));

  return (
    <div className="block text-[10px] text-ink/50">
      <span className="mb-1 block">{label}</span>
      <div className="overflow-hidden rounded-lg border border-dashed border-line hover:border-brand/30">
        {url && isImage ? (
          <div className="relative">
            <button
              type="button"
              className="group relative block aspect-square w-full overflow-hidden bg-surface"
              onClick={() => setOpen(true)}
              title={`放大查看：${label}`}
            >
              <img src={url} alt={label} className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                <ZoomIn size={16} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
              </span>
            </button>
            <label className="flex cursor-pointer items-center justify-center border-t border-line bg-white/70 px-2 py-1 text-[10px] text-ink/55 hover:bg-brand/5 hover:text-brand">
              更换
              <input
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        ) : (
          <label className="flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-1 px-2 py-4 text-center text-[10px] text-ink/45">
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.currentTarget.value = '';
              }}
            />
            <span>{url ? '已上传 · 点击替换' : hint ?? '点击上传'}</span>
          </label>
        )}
      </div>
      <ImageLightbox open={open} items={items} index={startIndex < 0 ? 0 : startIndex} onClose={() => setOpen(false)} />
    </div>
  );
}

export function ChipList({
  items,
  selected,
  onToggle,
}: {
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              active ? 'bg-brand/10 border-brand/40 text-brand' : 'border-line text-ink/55'
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}

export function VariantGrid({
  title,
  items,
  onChangeItem,
  onUploadItem,
  columns = 2,
  maxHeightClass = 'max-h-48',
  /** 传入完整角色图集时，放大可左右切换所有角色图 */
  sharedGallery,
}: {
  title: string;
  items: Array<{ id: string; label: string; prompt?: string; imageUrl?: string }>;
  onChangeItem: (id: string, patch: { prompt?: string; imageUrl?: string }) => void;
  onUploadItem?: (id: string, file: File) => void;
  columns?: 2 | 3 | 4 | 5;
  maxHeightClass?: string;
  sharedGallery?: ImageLightboxItem[];
}) {
  const colClass =
    columns === 5 ? 'grid-cols-5' : columns === 4 ? 'grid-cols-4' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const localGallery = useMemo(
    () => items.filter((item) => item.imageUrl).map((item) => ({ url: item.imageUrl as string, label: item.label })),
    [items],
  );
  const gallery = sharedGallery && sharedGallery.length > 0 ? sharedGallery : localGallery;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-ink/40">{title}</p>
      <div className={`grid ${colClass} gap-1.5 ${maxHeightClass} overflow-y-auto nx9-scroll`}>
        {items.map((item) => {
          const galleryIndex = gallery.findIndex((g) => g.url === item.imageUrl);
          return (
            <div key={item.id} className="space-y-1 rounded-lg border border-line/80 p-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-surface">
                {item.imageUrl ? (
                  <button
                    type="button"
                    className="group relative h-full w-full"
                    onClick={() => {
                      setIndex(Math.max(0, galleryIndex));
                      setOpen(true);
                    }}
                    title={`放大查看：${item.label}`}
                  >
                    <img src={item.imageUrl} alt={item.label} className="h-full w-full object-cover" />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                      <ZoomIn size={14} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
                    </span>
                  </button>
                ) : (
                  <div className="grid h-full place-items-center text-[9px] text-ink/30">待回填</div>
                )}
                {onUploadItem ? (
                  <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/45 px-1 py-0.5 text-center text-[9px] text-white/90">
                    上传
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadItem(item.id, f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <span className="block truncate text-[10px] font-medium text-ink/70" title={item.label}>{item.label}</span>
            </div>
          );
        })}
      </div>
      <ImageLightbox open={open} items={gallery} index={index} onClose={() => setOpen(false)} />
    </div>
  );
}
