import { lazy, memo, Suspense, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

const TABS = [
  { id: 'style', label: '风格', kind: 'style-atelier' },
  { id: 'tag', label: '标签', kind: 'tag-atelier' },
] as const;

type StyleLabTab = (typeof TABS)[number]['id'];

const PANELS = {
  'style-atelier': lazy(() => import('./StyleAtelierBlock')),
  'tag-atelier': lazy(() => import('./TagAtelierBlock')),
};

function StyleLabBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const tab = ((props.data?.styleLabTab as StyleLabTab) ?? 'style') as StyleLabTab;
  const tabMeta = TABS.find((t) => t.id === tab) ?? TABS[0];
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
              onClick={() => updateNodeData(props.id, { styleLabTab: t.id })}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                tab === t.id
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

export default memo(StyleLabBlock);
