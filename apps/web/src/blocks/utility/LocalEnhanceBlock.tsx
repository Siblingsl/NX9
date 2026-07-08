import { lazy, memo, Suspense, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

const TABS = [
  { id: 'picture', label: '图像', kind: 'topaz-picture' },
  { id: 'clip', label: '视频', kind: 'topaz-clip' },
] as const;

type EnhanceMode = (typeof TABS)[number]['id'];

const PANELS = {
  'topaz-picture': lazy(() => import('../utility/TopazPictureBlock')),
  'topaz-clip': lazy(() => import('../utility/TopazClipBlock')),
};

function LocalEnhanceBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const mode = ((props.data?.enhanceMode as EnhanceMode) ?? 'picture') as EnhanceMode;
  const tabMeta = TABS.find((t) => t.id === mode) ?? TABS[0];
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
              onClick={() => updateNodeData(props.id, { enhanceMode: t.id })}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                mode === t.id
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

export default memo(LocalEnhanceBlock);
