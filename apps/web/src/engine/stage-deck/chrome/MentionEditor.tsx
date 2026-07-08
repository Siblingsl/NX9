import { useCallback, useMemo, useRef, useState } from 'react';
import { gatherUpstream } from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import {
  detectMentionQuery,
  insertMentionToken,
  type MentionOption,
} from '../interaction/mention-editor';
import { useAliasStore } from '../stores/alias-store';

interface MentionEditorProps {
  blockId: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MentionEditor({
  blockId,
  value,
  placeholder,
  onChange,
  className,
}: MentionEditorProps) {
  const { getNodes, getEdges } = useReactFlow();
  const aliases = useAliasStore((s) => s.aliases);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const options = useMemo((): MentionOption[] => {
    const nodes = getNodes();
    const edges = getEdges();
    const upstream = gatherUpstream(
      blockId,
      nodes.map((n) => ({
        id: n.id,
        type: n.type ?? 'prompt',
        position: n.position,
        data: (n.data ?? {}) as Record<string, unknown>,
      })),
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    );
    const out: MentionOption[] = [];
    upstream.pictures.forEach((url, i) => {
      out.push({ blockId: `pic-${i}`, label: `图${i + 1}`, url });
    });
    nodes
      .filter((n) => n.id !== blockId)
      .forEach((n) => {
        const url =
          (n.data?.previewUrl as string) ||
          (n.data?.videoUrl as string) ||
          (n.data?.lastCaptureUrl as string);
        if (!url && n.type !== 'prompt') return;
        out.push({
          blockId: n.id,
          label: aliases[n.id] || n.type || n.id.slice(0, 8),
          url,
        });
      });
    return out;
  }, [blockId, getNodes, getEdges, aliases]);

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 8);
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 8);
  }, [options, query]);

  const handleChange = useCallback(
    (next: string, cursor: number) => {
      onChange(next);
      const q = detectMentionQuery(next, cursor);
      setQuery(q ?? '');
      setMenuOpen(q !== null && filtered.length > 0);
    },
    [onChange, filtered.length],
  );

  const pickOption = (opt: MentionOption) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const { value: next, cursor: nextCursor } = insertMentionToken(value, cursor, opt);
    onChange(next);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="relative flex-1 min-h-0">
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setMenuOpen(false);
        }}
        className={className}
      />
      {menuOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 max-h-40 overflow-y-auto rounded-xl border border-line bg-white shadow-panel z-10 nx9-scroll">
          {filtered.map((opt) => (
            <button
              key={`${opt.blockId}-${opt.label}`}
              type="button"
              onClick={() => pickOption(opt)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface"
            >
              {opt.url ? (
                <img src={opt.url} alt="" className="w-8 h-8 rounded object-cover border border-line" />
              ) : (
                <span className="w-8 h-8 rounded bg-surface border border-line flex items-center justify-center text-[10px]">
                  @
                </span>
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
