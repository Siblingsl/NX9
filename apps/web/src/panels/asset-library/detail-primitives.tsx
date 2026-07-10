import type { ReactNode } from 'react';
import { Copy, RefreshCw } from 'lucide-react';

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
}: {
  label: string;
  url?: string | null;
  accept: string;
  onUpload: (file: File) => void;
  hint?: string;
}) {
  return (
    <label className="block text-[10px] text-ink/50 cursor-pointer">
      <span className="mb-1 block">{label}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
      <div className="rounded-lg border border-dashed border-line py-4 text-center hover:border-brand/30 text-[10px]">
        {url ? '已上传 · 点击替换' : hint ?? '点击上传'}
      </div>
    </label>
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
}: {
  title: string;
  items: Array<{ id: string; label: string; prompt?: string }>;
  onChangeItem: (id: string, patch: { prompt?: string; imageUrl?: string }) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-ink/40">{title}</p>
      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto nx9-scroll">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-line/80 p-1.5 space-y-1">
            <span className="text-[10px] font-medium text-ink/70">{item.label}</span>
            <input
              value={item.prompt ?? ''}
              onChange={(e) => onChangeItem(item.id, { prompt: e.target.value })}
              placeholder="prompt…"
              className="w-full text-[10px] rounded border border-line px-1.5 py-1 font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
