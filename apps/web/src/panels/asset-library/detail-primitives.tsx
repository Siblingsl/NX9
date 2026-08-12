import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, MoreHorizontal, RefreshCw, RotateCcw, ZoomIn } from 'lucide-react';
import { ImageLightbox, type ImageLightboxItem } from '../../components/ui/ImageLightbox';

export function DetailSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  /** OL-17：分区锚点 id（不含 #） */
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-10 space-y-2 border-t border-line/70 pt-3 first:border-t-0 first:pt-0"
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink/55">{title}</h4>
      {children}
    </section>
  );
}

/** OL-17：详情分区粘性导航 */
export function DetailSectionNav({
  sections,
}: {
  sections: Array<{ id: string; label: string }>;
}) {
  if (sections.length === 0) return null;
  return (
    <nav className="sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap gap-1 border-b border-line/50 bg-surface/95 px-1 py-1.5 backdrop-blur-sm">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55 hover:border-brand/40 hover:text-brand"
          onClick={() => {
            document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {s.label}
        </button>
      ))}
    </nav>
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

/**
 * 捏脸参数滑块：-100 ~ +100，0 为中性。
 *
 * 拖动只改内部 draft，松手 / 失焦 / 300ms 静默才向上提交，
 * 避免 45 项滑块每帧整档写库（见 docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md）。
 */
export function ParamSlider({
  label,
  value,
  onCommit,
  onInput,
  hint,
  low,
  high,
  min = -100,
  max = 100,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  /** 拖动过程立刻回调（不写库）；用于 3D 视口实时变形 */
  onInput?: (v: number) => void;
  hint?: string;
  low: string;
  high: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (v: number) => {
    dragging.current = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (v !== value) onCommit(v);
  };

  const handleInput = (v: number) => {
    dragging.current = true;
    setDraft(v);
    onInput?.(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 300);
  };

  const deviated = draft !== 0;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] ${deviated ? 'text-ink/70' : 'text-ink/40'}`}>
          {label}
          {hint ? <span className="ml-1 font-normal text-ink/30">{hint}</span> : null}
        </span>
        <div className="flex items-center gap-1">
          <span className={`font-mono text-[10px] tabular-nums ${deviated ? 'text-brand' : 'text-ink/35'}`}>
            {draft > 0 ? `+${draft}` : draft}
          </span>
          {deviated && !disabled ? (
            <button
              type="button"
              title="重置为中性"
              aria-label={`重置 ${label}`}
              className="rounded p-0.5 text-ink/40 hover:bg-brand/10 hover:text-brand"
              onClick={() => {
                setDraft(0);
                onInput?.(0);
                commit(0);
              }}
            >
              <RotateCcw size={10} />
            </button>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={draft}
        disabled={disabled}
        aria-label={label}
        className="w-full accent-brand disabled:opacity-40"
        onChange={(e) => handleInput(Number(e.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => commit(draft)}
      />
      <div className="flex justify-between gap-2 text-[9px] leading-tight text-ink/30">
        <span className="truncate">{low}</span>
        <span className="truncate text-right">{high}</span>
      </div>
    </div>
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

function CharacterItemMoreMenu({
  label,
  accept,
  onUpload,
  onCrop,
  onRegenerate,
}: {
  label: string;
  accept: string;
  onUpload: (file: File) => void;
  onCrop?: () => void;
  onRegenerate?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute right-1 top-1 z-20">
      <button
        type="button"
        title={`更多操作：${label}`}
        aria-label={`更多操作：${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-6 w-6 place-items-center rounded bg-ink/60 text-white hover:bg-brand"
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div className="absolute right-0 top-7 w-32 overflow-hidden rounded-lg border border-white/15 bg-[#252525] py-1 text-white shadow-2xl">
          <button
            type="button"
            disabled={!onCrop}
            onClick={() => {
              setOpen(false);
              onCrop?.();
            }}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-white/90 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            调整裁剪
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRegenerate?.();
            }}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-[10px] text-white/90 hover:bg-white/10"
          >
            单独重新生成
          </button>
          <label className="flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left text-[10px] text-white/90 hover:bg-white/10">
            重新上传
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.currentTarget.value = '';
                setOpen(false);
              }}
            />
          </label>
        </div>
      ) : null}
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
  onCrop,
  compact = false,
}: {
  label: string;
  url?: string | null;
  accept: string;
  onUpload: (file: File) => void;
  hint?: string;
  /** 放大时的图集（含当前图）；不传则仅当前图 */
  gallery?: ImageLightboxItem[];
  onCrop?: () => void;
  /** 角色设定板子项使用与 VariantGrid 一致的紧凑卡片布局 */
  compact?: boolean;
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
    <div className={compact ? 'space-y-1 rounded-lg border border-line/80 p-1.5 text-[10px] text-ink/50' : 'block text-[10px] text-ink/50'}>
      <span className={compact ? 'flex h-5 items-center justify-center truncate text-center text-[10px] font-semibold text-white/90' : 'mb-1 block'} title={compact ? label : undefined}>{label}</span>
      <div className={compact ? 'relative aspect-square overflow-visible rounded-md border border-line bg-surface' : 'overflow-hidden rounded-lg border border-dashed border-line hover:border-brand/30'}>
        {url && isImage ? (
          <div className="relative">
            <button
              type="button"
              className={compact ? 'group relative block h-full w-full overflow-hidden bg-surface' : 'group relative block aspect-square w-full overflow-hidden bg-surface'}
              onClick={() => setOpen(true)}
              title={`放大查看：${label}`}
            >
              <img src={url} alt={label} className="h-full w-full object-cover" />
              <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                <ZoomIn size={16} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
              </span>
            </button>
            {!compact ? <label className="flex cursor-pointer items-center justify-center border-t border-line bg-surface/70 px-2 py-1 text-[10px] text-ink/55 hover:bg-brand/5 hover:text-brand">
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
            </label> : null}
            {compact ? <CharacterItemMoreMenu label={label} accept={accept} onUpload={onUpload} onCrop={onCrop} /> : null}
          </div>
        ) : (
          <label className={compact ? 'flex h-full min-h-[84px] cursor-pointer flex-col items-center justify-center gap-1 px-2 py-4 text-center text-[9px] text-ink/45' : 'flex min-h-[84px] cursor-pointer flex-col items-center justify-center gap-1 px-2 py-4 text-center text-[10px] text-ink/45'}>
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
            <span>{url ? (compact ? '已上传' : '已上传 · 点击替换') : hint ?? '点击上传'}</span>
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
  maxHeightClass = '',
  /** 传入完整角色图集时，放大可左右切换所有角色图 */
  sharedGallery,
  onCropItem,
}: {
  title: string;
  items: Array<{ id: string; label: string; prompt?: string; imageUrl?: string }>;
  onChangeItem: (id: string, patch: { prompt?: string; imageUrl?: string }) => void;
  onUploadItem?: (id: string, file: File) => void;
  columns?: 2 | 3 | 4 | 5;
  maxHeightClass?: string;
  sharedGallery?: ImageLightboxItem[];
  onCropItem?: (id: string) => void;
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
      <div className={`grid ${colClass} gap-1.5 ${maxHeightClass}`}>
        {items.map((item) => {
          const galleryIndex = gallery.findIndex((g) => g.url === item.imageUrl);
          return (
            <div key={item.id} className="space-y-1 rounded-lg border border-line/80 p-1.5">
              <span className="flex h-5 items-center justify-center truncate text-center text-[10px] font-semibold text-white/90" title={item.label}>{item.label}</span>
              <div className="relative aspect-square overflow-visible rounded-md border border-line bg-surface">
                {item.imageUrl ? (
                  <button
                    type="button"
                    className="group relative h-full w-full overflow-hidden rounded-md"
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
                  <CharacterItemMoreMenu
                    label={item.label}
                    accept="image/*"
                    onUpload={(file) => onUploadItem(item.id, file)}
                    onCrop={item.imageUrl && onCropItem ? () => onCropItem(item.id) : undefined}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <ImageLightbox open={open} items={gallery} index={index} onClose={() => setOpen(false)} />
    </div>
  );
}
