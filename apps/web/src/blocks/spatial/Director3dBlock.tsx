import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow, useStore } from '@xyflow/react';
import { Box, ExternalLink, Image as ImageIcon } from 'lucide-react';
import {
  emptyStoryboardPreview,
  resolveConnectedStoryboardPreviewForDirector3dId,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { normalizeDirectorProject } from '@nx9/director3d';
import { BlockShell } from '../shared/BlockShell';
import { openDirector3dStage } from '../../engine/director3d-open';
import './director-3d.css';

function Director3dBlock(props: NodeProps) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const { updateNodeData } = useReactFlow();

  const data = (props.data ?? {}) as Record<string, unknown>;
  const project = useMemo(() => normalizeDirectorProject(data.scene), [data.scene]);
  const lastCaptureUrl = data.lastCaptureUrl as string | undefined;
  const lastCameraPrompt = data.lastCameraPrompt as string | undefined;

  const previewBlockId = useMemo(
    () => resolveConnectedStoryboardPreviewForDirector3dId(props.id, nodes, edges),
    [props.id, nodes, edges],
  );

  const previewNode = previewBlockId
    ? nodes.find((item) => item.id === previewBlockId)
    : undefined;
  const previewPayload = useMemo(() => {
    const raw = (previewNode?.data as Record<string, unknown> | undefined)
      ?.storyboardPreview as StoryboardPreviewPayload | undefined;
    if (raw?.version === 1 && Array.isArray(raw.frames)) {
      return { ...emptyStoryboardPreview(), ...raw };
    }
    return emptyStoryboardPreview();
  }, [previewNode?.data]);

  const linkedFrameId =
    (data.linkedStoryboardPreviewFrameId as string | undefined) ??
    previewPayload.selectedFrameId ??
    null;
  const linkedFrame = previewPayload.frames.find((frame) => frame.id === linkedFrameId);

  const previewUrl =
    lastCaptureUrl ??
    linkedFrame?.director3dGuide?.captureUrl ??
    linkedFrame?.imageUrl ??
    linkedFrame?.referenceImageUrl ??
    undefined;

  const captureCount = project.cameras.reduce(
    (total, camera) => total + camera.captures.length,
    0,
  );
  const characterCount = project.objects.filter((o) => o.kind === 'character').length;
  const cameraPrompt =
    linkedFrame?.director3dGuide?.cameraPrompt ??
    lastCameraPrompt ??
    project.cameras
      .find((c) => c.id === project.activeCameraId)
      ?.captures.slice(-1)[0]?.cameraPrompt;

  const selectFrame = useCallback(
    (frameId: string) => {
      updateNodeData(props.id, {
        linkedStoryboardPreviewId: previewBlockId ?? null,
        linkedStoryboardPreviewFrameId: frameId || null,
      });
      if (!previewBlockId) return;
      updateNodeData(previewBlockId, {
        storyboardPreview: {
          ...previewPayload,
          selectedFrameId: frameId || null,
        },
      });
    },
    [props.id, previewBlockId, previewPayload, updateNodeData],
  );

  const openStage = useCallback(() => {
    openDirector3dStage({
      blockId: props.id,
      nodes,
      edges,
      updateNodeData: (id, patch) => updateNodeData(id, patch),
      frameIdOverride: linkedFrameId,
    });
  }, [props.id, nodes, edges, updateNodeData, linkedFrameId]);

  const sortedFrames = useMemo(
    () => [...previewPayload.frames].sort((a, b) => a.order - b.order),
    [previewPayload.frames],
  );

  return (
    <BlockShell {...props}>
      <div className="d3 d3-card nodrag nopan">
        <div
          className="d3-preview"
          onDoubleClick={openStage}
          onClick={openStage}
          role="button"
          title="打开 3D 舞台"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="d3-preview__img" draggable={false} />
          ) : (
            <div className="d3-preview__empty">
              <Box size={26} strokeWidth={1.25} />
              <span>打开 3D 舞台摆位</span>
            </div>
          )}
          <div className="d3-preview__badges">
            <span className="d3-badge">{project.viewportAspectRatio}</span>
            <span className="d3-badge">
              {project.cameras.length} 机位 · {captureCount} 快照 · {characterCount}{' '}
              角色 · {sortedFrames.length} 分镜帧
            </span>
            {linkedFrame?.director3dGuide && (
              <span className="d3-badge is-accent">已应用到 {linkedFrame.label}</span>
            )}
          </div>
        </div>

        {previewBlockId && sortedFrames.length > 0 && (
          <div className="d3-field">
            <label htmlFor={`d3-frame-${props.id}`}>分镜</label>
            <select
              id={`d3-frame-${props.id}`}
              className="d3-select"
              value={linkedFrameId ?? ''}
              onChange={(e) => selectFrame(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">选择帧</option>
              {sortedFrames.map((frame) => (
                <option key={frame.id} value={frame.id} disabled={frame.locked}>
                  {frame.label}
                  {frame.locked ? ' · 锁' : ''}
                  {frame.director3dGuide ? ' · 已设' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {cameraPrompt ? (
          <p className="d3-prompt" title={cameraPrompt}>
            {cameraPrompt}
          </p>
        ) : (
          <p className="d3-hint">
            {linkedFrame
              ? `设计 ${linkedFrame.label} 机位后写回分镜`
              : previewBlockId
                ? '选择分镜帧，或直接进入 3D 舞台'
                : '独立搭建场景 · 可连分镜台 / 图像生成'}
          </p>
        )}

        <div className="d3-acts">
          {lastCaptureUrl && (
            <a
              href={lastCaptureUrl}
              target="_blank"
              rel="noreferrer"
              className="d3-btn is-ghost"
              onClick={(e) => e.stopPropagation()}
              title="导出快照"
            >
              <ImageIcon size={12} />
            </a>
          )}
          <button type="button" className="d3-btn is-primary" onClick={openStage}>
            <ExternalLink size={12} />
            打开 3D 舞台
          </button>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(Director3dBlock);
