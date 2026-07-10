import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { gatherUpstream } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';

function VariantForkBlock(props: NodeProps) {
  const { updateNodeData, getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const variant = (props.data?.variantLabel as 'A' | 'B') ?? 'A';
  const notes = (props.data?.forkNotes as string) ?? '';
  const upstream = props.data?.upstream as {
    prompts?: string[];
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
  } | undefined;

  const applyVariant = useCallback(
    (label: 'A' | 'B') => {
      const allNodes = getNodes();
      const allEdges = getEdges();
      const upstreamBlocks = gatherUpstream(props.id, allNodes as unknown as import('@nx9/shared').FlowBlock[], allEdges as unknown as import('@nx9/shared').FlowLink[]);

      const upstreamIds = new Set<string>();
      for (const bid of allEdges.filter((e) => e.target === props.id).map((e) => e.id)) {
        const src = allEdges.find((e) => e.id === bid)?.source;
        if (src) upstreamIds.add(src);
      }

      if (upstreamIds.size > 0) {
        let maxId = allNodes.reduce((m, n) => Math.max(m, /(\d+)$/.exec(n.id)?.[1] ? Number(/\d+$/.exec(n.id)![1]) : 0), 0);
        const idMap = new Map<string, string>();
        const newNodes = allNodes
          .filter((n) => upstreamIds.has(n.id))
          .map((n) => {
            const newId = `var-${label.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
            idMap.set(n.id, newId);
            return {
              ...n,
              id: newId,
              position: { x: n.position.x + 300, y: n.position.y + (label === 'B' ? 200 : 0) },
              selected: false,
              data: { ...n.data, status: 'idle', blockIndex: ++maxId },
            };
          });
        const newEdges = allEdges
          .filter((e) => upstreamIds.has(e.source) && e.target === props.id)
          .map((e) => ({
            ...e,
            id: `var-e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            source: idMap.get(e.source) ?? e.source,
            target: idMap.get(e.target) ?? e.target,
          }));
        setNodes((prev) => [...prev, ...newNodes]);
        setEdges((prev) => [...prev, ...newEdges]);
      }

      updateNodeData(props.id, {
        variantLabel: label,
        meta: { variant: label, forkNotes: notes },
        content: upstream?.prompts?.[0] ?? '',
        output: upstream?.prompts?.[0],
        pictures: upstream?.pictures,
        clips: upstream?.clips,
        sounds: upstream?.sounds,
      });
    },
    [notes, upstream, props.id, updateNodeData, getNodes, getEdges, setNodes, setEdges],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-1">
          {(['A', 'B'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => applyVariant(v)}
              className={`flex-1 py-1.5 rounded-lg border font-semibold ${
                variant === v ? 'border-accent bg-accent/10 text-accent' : 'border-line'
              }`}
            >
              方案 {v}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => updateNodeData(props.id, { forkNotes: e.target.value, meta: { variant, forkNotes: e.target.value } })}
          placeholder="A/B 对比备注…"
          className="w-full min-h-[40px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        <p className="text-[10px] text-ink/50">
          当前标记 <strong>{variant}</strong> · Take 侧可对比
        </p>
      </div>
    </BlockShell>
  );
}

export default memo(VariantForkBlock);
