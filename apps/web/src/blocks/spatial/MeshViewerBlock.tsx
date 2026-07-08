import { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Box } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { useDirector3dUi } from '../../stores/director3d-ui';
import { emptyDirectorProject, normalizeDirectorProject } from '@nx9/director3d';

function MeshViewerBlock(props: NodeProps) {
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const meshUrl =
    (props.data?.meshUrl as string) ||
    (props.data?.upstream as { meshUrl?: string })?.meshUrl ||
    (props.data?.assetUrl as string);

  const openInStage = useCallback(() => {
    const project = normalizeDirectorProject(props.data?.scene) ?? emptyDirectorProject();
    const assetId = `asset-mesh-${props.id}`;
    const objectId = `mesh-obj-${props.id}`;
    const withMesh = {
      ...project,
      assets: [
        ...project.assets.filter((a) => a.id !== assetId),
        {
          id: assetId,
          kind: 'mesh' as const,
          name: (props.data?.fileName as string) || '导入模型',
          url: meshUrl!,
        },
      ],
      objects: meshUrl
        ? [
            ...project.objects.filter((o) => o.id !== objectId),
            {
              id: objectId,
              name: '导入模型',
              kind: 'mesh' as const,
              visible: true,
              locked: false,
              assetId,
              meshUrl,
              transform: {
                position: [0, 0, 0] as [number, number, number],
                rotation: [0, 0, 0] as [number, number, number],
                scale: [1, 1, 1] as [number, number, number],
              },
            },
          ]
        : project.objects,
    };
    openForBlock(props.id, withMesh);
  }, [openForBlock, props.id, props.data, meshUrl]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-line bg-surface/80 aspect-video flex flex-col items-center justify-center gap-2 text-ink/40">
          <Box size={28} className="text-accent/70" />
          <span className="text-[10px]">{meshUrl ? '模型已加载' : '等待上游模型'}</span>
        </div>
        <button
          type="button"
          onClick={openInStage}
          disabled={!meshUrl}
          className="w-full rounded-xl bg-accent text-white text-sm py-2 hover:bg-accent/90 disabled:opacity-40"
        >
          在 Stage Deck 中预览
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(MeshViewerBlock);
