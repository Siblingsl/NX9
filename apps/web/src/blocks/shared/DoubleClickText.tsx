import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';

interface DoubleClickTextProps {
  value: string;
  placeholder?: string;
  onSave: (next: string) => void;
  onRestore?: () => void;
  edited?: boolean;
  maxHeight?: number;
  className?: string;
}

export const DoubleClickText = memo(function DoubleClickText({
  value,
  placeholder = '(空)',
  onSave,
  onRestore,
  edited,
  maxHeight = 200,
  className = '',
}: DoubleClickTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const enterEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => taRef.current?.focus(), 30);
  }, [value]);

  const save = useCallback(() => {
    onSave(draft);
    setEditing(false);
  }, [draft, onSave]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[10px] text-ink/50">
          <span className="flex-1">文本{edited ? ' · 已编辑' : ''}</span>
          <button
            type="button"
            className="nodrag nopan p-0.5 rounded hover:bg-black/5"
            onClick={enterEdit}
            title="双击文本编辑"
          >
            <Pencil size={10} />
          </button>
          {edited && onRestore && (
            <button
              type="button"
              className="nodrag nopan text-[10px] px-1 rounded hover:bg-black/5 text-ink/60"
              onClick={onRestore}
            >
              恢复
            </button>
          )}
        </div>
        <div
          className={`nodrag nopan whitespace-pre-wrap break-words text-[12px] leading-relaxed rounded px-2 py-1.5 cursor-text bg-black/5 text-ink/85 ${className}`}
          style={{ maxHeight, overflow: 'auto' }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            enterEdit();
          }}
          title="双击编辑"
        >
          {value || <span className="opacity-50">{placeholder}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 nodrag nopan">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={6}
        className="w-full rounded px-2 py-1.5 text-[12px] outline-none nodrag nopan bg-white text-ink border border-brand/40"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <div className="flex gap-1.5 justify-end">
        <button type="button" className="text-[10px] px-2 py-0.5 rounded bg-black/5" onClick={cancel}>
          取消
        </button>
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1 bg-brand text-white"
          onClick={save}
        >
          <Check size={10} /> 保存
        </button>
      </div>
    </div>
  );
});
