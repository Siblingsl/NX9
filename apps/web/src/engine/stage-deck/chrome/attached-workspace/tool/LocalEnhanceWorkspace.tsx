import { lazy, Suspense, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useAttachedNodeData } from '../generation/use-attached-node-data';

const TABS = [
  { id: 'picture', label: '高清图像', kind: 'topaz-picture' as const },
  { id: 'clip', label: '高清视频', kind: 'topaz-clip' as const },
  { id: 'upscale', label: '放大', kind: 'upscale-lite' as const },
  { id: 'watermark', label: '去水印', kind: 'watermark-clean' as const },
] as const;

type EnhanceMode = (typeof TABS)[number]['id'];

const PANELS = {
  'topaz-picture': lazy(() => import('../../../../../blocks/utility/TopazPictureBlock')),
  'topaz-clip': lazy(() => import('../../../../../blocks/utility/TopazClipBlock')),
  'upscale-lite': lazy(() => import('../../../../../blocks/utility/UpscaleLiteBlock')),
  'watermark-clean': lazy(() => import('../../../../../blocks/support/WatermarkCleanBlock')),
};

export interface LocalEnhanceWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function LocalEnhanceWorkspace({ blockId, kind, onCollapse }: LocalEnhanceWorkspaceProps) {
  const { updateNodeData } = useReactFlow();
  const data = useAttachedNodeData(blockId);
  const rawMode = (data.enhanceMode as string) ?? 'picture';
  const mode = (
    rawMode === 'control' || rawMode === 'scale' || rawMode === 'diff' ? 'upscale' : rawMode
  ) as EnhanceMode;
  const tabMeta = TABS.find((t) => t.id === mode) ?? TABS[0];
  const Panel = PANELS[tabMeta.kind];

  const embedProps = useMemo(
    () => ({
      id: blockId,
      type: tabMeta.kind,
      data: { ...(data ?? {}), studioEmbed: true },
      selected: false,
    }),
    [blockId, data, tabMeta.kind],
  );

  const status = (data.status as string) ?? 'idle';

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={onCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      heightClass="h-auto max-h-[480px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2 overflow-y-auto nowheel overscroll-contain"
    >
      <div className="space-y-2 nodrag nopan">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateNodeData(blockId, { enhanceMode: t.id })}
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
          <Panel {...(embedProps as any)} />
        </Suspense>
      </div>
    </ComposerWorkspaceShell>
  );
}
