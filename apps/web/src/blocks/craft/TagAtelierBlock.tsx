import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { ANIME_TAG_PRESETS } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';

function TagAtelierBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const selectedIds = (props.data?.selectedTagIds as string[]) ?? [];
  const extra = (props.data?.extra as string) ?? '';
  const upstream = props.data?.upstream as { prompts?: string[] } | undefined;

  const composed = useMemo(() => {
    const parts = ANIME_TAG_PRESETS.filter((p) => selectedIds.includes(p.id)).map((p) => p.tags);
    if (extra.trim()) parts.push(extra.trim());
    if (upstream?.prompts?.length) parts.unshift(upstream.prompts.join(', '));
    return parts.join(', ');
  }, [selectedIds, extra, upstream]);

  const toggle = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      const parts = ANIME_TAG_PRESETS.filter((p) => next.includes(p.id)).map((p) => p.tags);
      if (extra.trim()) parts.push(extra.trim());
      updateNodeData(props.id, { selectedTagIds: next, content: parts.join(', ') });
    },
    [selectedIds, extra, props.id, updateNodeData],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof ANIME_TAG_PRESETS>();
    for (const p of ANIME_TAG_PRESETS) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-h-56 overflow-y-auto nx9-scroll">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="text-[10px] text-ink/40 uppercase mb-1">{group}</p>
            <div className="flex flex-wrap gap-1">
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`px-2 py-0.5 rounded-full border text-[11px] ${
                    selectedIds.includes(p.id) ? 'border-warn bg-warn/10 text-warn' : 'border-line'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <textarea
          value={extra}
          onChange={(e) => {
            const val = e.target.value;
            const parts = ANIME_TAG_PRESETS.filter((p) => selectedIds.includes(p.id)).map((p) => p.tags);
            if (val.trim()) parts.push(val.trim());
            updateNodeData(props.id, { extra: val, content: parts.join(', ') });
          }}
          placeholder="补充标签…"
          className="w-full min-h-[40px] rounded-xl border border-line px-2 py-1"
        />
        {composed && <p className="text-[10px] font-mono text-ink/70 line-clamp-4">{composed}</p>}
      </div>
    </BlockShell>
  );
}

export default memo(TagAtelierBlock);
