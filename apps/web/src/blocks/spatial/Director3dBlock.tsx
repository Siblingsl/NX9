import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Box } from 'lucide-react';
import {
  emptyDirectorProject,
  normalizeDirectorProject,
  type DirectorProject,
} from '@nx9/director3d';
import { BlockShell } from '../shared/BlockShell';
import { useDirector3dUi } from '../../stores/director3d-ui';

function Director3dBlock(props: NodeProps) {
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const project = normalizeDirectorProject(props.data?.scene);
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const lastCaptureUrl = props.data?.lastCaptureUrl as string | undefined;
  const activeCam = project.cameras.find((c) => c.id === project.activeCameraId);
  const captureCount = project.cameras.reduce((n, c) => n + c.captures.length, 0);

  const open = useCallback(() => {
    openForBlock(props.id, project, linkedShotId);
  }, [openForBlock, props.id, project, linkedShotId]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <div className="rounded-xl border border-line bg-surface/80 aspect-video flex flex-col items-center justify-center gap-2 text-ink/40 overflow-hidden">
          {lastCaptureUrl ? (
            <img
              src={lastCaptureUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <Box size={28} className="text-brand/60" />
              <span className="text-[10px]">双击或点击下方按钮打开 3D 预演</span>
            </>
          )}
        </div>
        <p className="text-[10px] text-ink/50">
          画幅 {project.viewportAspectRatio} · 角色{' '}
          {project.objects.filter((o) => o.kind === 'character').length} · 机位{' '}
          {project.cameras.length} · 截图 {captureCount}
        </p>
        {activeCam?.captures[activeCam.captures.length - 1]?.cameraPrompt && (
          <p className="text-[10px] text-ink/40 line-clamp-2">
            机位: {activeCam.captures[activeCam.captures.length - 1].cameraPrompt}
          </p>
        )}
        {(props.data?.lastCameraPrompt as string) && (
          <p className="text-[10px] text-brand/70 line-clamp-2">
            输出机位 → 可连 camera-prompt / picture-gen
          </p>
        )}
        <button
          type="button"
          onClick={open}
          className="w-full rounded-xl bg-brand text-white text-sm py-2 hover:bg-brand/90"
        >
          打开 3D 预演
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(Director3dBlock);
