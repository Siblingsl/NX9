import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { PORTRAIT_PRESETS, buildPortraitPrompt } from '@nx9/shared';

function PortraitCraftPanel(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const selectedIds = (props.data?.portraitSelectedIds as string[]) ?? [];
  const extra = (props.data?.extra as string) ?? '';

  const groups = useMemo(() => {
    const map = new Map<string, typeof PORTRAIT_PRESETS>();
    for (const p of PORTRAIT_PRESETS) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, []);

  const sync = useCallback(
    (ids: string[], nextExtra: string) => {
      const content = buildPortraitPrompt(ids, nextExtra);
      updateNodeData(props.id, {
        portraitSelectedIds: ids,
        extra: nextExtra,
        content,
        output: content,
      });
    },
    [props.id, updateNodeData],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      sync(next, extra);
    },
    [selectedIds, extra, sync],
  );

  return (
    <div className="space-y-2 text-xs max-h-56 overflow-y-auto nx9-scroll">
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
                  selectedIds.includes(p.id)
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line hover:border-accent/30'
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
        onChange={(e) => sync(selectedIds, e.target.value)}
        placeholder="补充肖像描述…"
        className="w-full min-h-[48px] rounded-xl border border-line px-2 py-1.5 resize-y"
      />
    </div>
  );
}

export default memo(PortraitCraftPanel);
