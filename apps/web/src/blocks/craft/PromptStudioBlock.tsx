import { lazy, memo, Suspense, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

const TAB_META = [
  { id: 'cinema', label: '电影感', kind: 'cinema-prompt' },
  { id: 'camera', label: '运镜', kind: 'camera-prompt' },
  { id: 'angle', label: '角度', kind: 'angle-visual' },
  { id: 'portrait', label: '肖像', kind: 'portrait-craft' },
  { id: 'pose', label: '姿势', kind: 'pose-craft' },
] as const;

type StudioTab = (typeof TAB_META)[number]['id'];

const PANELS: Record<string, ReturnType<typeof lazy>> = {
  'cinema-prompt': lazy(() => import('./CinemaPromptBlock')),
  'camera-prompt': lazy(() => import('./CameraPromptBlock')),
  'angle-visual': lazy(() => import('./AngleVisualBlock')),
  'portrait-craft': lazy(() => import('./panels/PortraitCraftPanel')),
  'pose-craft': lazy(() => import('./panels/PoseCraftPanel')),
};

function PromptStudioBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const tab = ((props.data?.studioTab as StudioTab) ?? 'cinema') as StudioTab;
  const tabMeta = TAB_META.find((t) => t.id === tab) ?? TAB_META[0];
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
          {TAB_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(props.id, { studioTab: t.id })}
              className={`px-2 py-0.5 rounded-full text-[10px] border ${
                tab === t.id
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-line text-ink/50 hover:border-brand/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Suspense fallback={<p className="text-xs text-ink/40 py-4 text-center">加载面板…</p>}>
          <Panel {...embedProps} />
        </Suspense>
      </div>
    </BlockShell>
  );
}

export default memo(PromptStudioBlock);
