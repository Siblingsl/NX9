import { lazy, memo, Suspense, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

const TABS = [
  { id: 'fal', label: 'FAL', kind: 'fal-market' },
  { id: 'comfy', label: 'ComfyUI', kind: 'comfy-market' },
] as const;

type MarketSource = (typeof TABS)[number]['id'];

const PANELS = {
  'fal-market': lazy(() => import('./FalMarketBlock')),
  'comfy-market': lazy(() => import('./ComfyMarketBlock')),
};

function ModelMarketBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const source = ((props.data?.marketSource as MarketSource) ?? 'fal') as MarketSource;
  const tabMeta = TABS.find((t) => t.id === source) ?? TABS[0];
  const Panel = PANELS[tabMeta.kind];

  const embedProps = useMemo(
    () => ({
      ...props,
      type: tabMeta.kind,
      data: { ...(props.data ?? {}), studioEmbed: true },
    }),
    [props, tabMeta.kind],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(props.id, { marketSource: t.id })}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                source === t.id
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-ink/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Suspense fallback={<p className="text-xs text-ink/40 py-4 text-center">加载…</p>}>
          <Panel {...embedProps} />
        </Suspense>
      </div>
    </BlockShell>
  );
}

export default memo(ModelMarketBlock);
