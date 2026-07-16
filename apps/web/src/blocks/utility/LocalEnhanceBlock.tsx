import { lazy, memo, Suspense, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

const TABS = [
  { id: 'picture', label: '高清图像', kind: 'topaz-picture' as const },
  { id: 'clip', label: '高清视频', kind: 'topaz-clip' as const },
  { id: 'upscale', label: '放大', kind: 'upscale-lite' as const },
  { id: 'watermark', label: '去水印', kind: 'watermark-clean' as const },
] as const;

type EnhanceMode = (typeof TABS)[number]['id'];

const PANELS = {
  'topaz-picture': lazy(() => import('../utility/TopazPictureBlock')),
  'topaz-clip': lazy(() => import('../utility/TopazClipBlock')),
  'upscale-lite': lazy(() => import('../utility/UpscaleLiteBlock')),
  'watermark-clean': lazy(() => import('../support/WatermarkCleanBlock')),
};

function LocalEnhanceBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const rawMode = (props.data?.enhanceMode as string) ?? 'picture';
  const mode = (
    rawMode === 'control' || rawMode === 'scale' || rawMode === 'diff' ? 'upscale' : rawMode
  ) as EnhanceMode;
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
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(props.id, { enhanceMode: t.id })}
              className={`px-2 py-1 rounded-lg text-[10px] border ${
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
