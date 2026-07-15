import { useCallback, useMemo } from 'react';
import { Box, ChevronDown, ExternalLink, GripVertical, Image as ImageIcon } from 'lucide-react';
import { useReactFlow, useStore } from '@xyflow/react';
import {
  emptyStoryboardPreview,
  lookupBlock,
  resolveConnectedPictureGenId,
  resolveConnectedStoryboardPreviewForDirector3dId,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { normalizeDirectorProject } from '@nx9/director3d';
import { useDeckUi } from '../../../stores/deck-ui';
import { useDirector3dUi } from '../../../../../stores/director3d-ui';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { prepareDirectorProjectForShot } from '../../../../director3d-character-sync';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface Director3dWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

/** 3D 导演台节点工作区：管理分镜帧绑定，完整摆位能力复用 Stage Deck 全屏面板。 */
export function Director3dWorkspace({
  blockId,
  kind,
  onCollapse,
}: Director3dWorkspaceProps) {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const { updateNodeData } = useReactFlow();
  const collapsePromptBar = useDeckUi((state) => state.collapsePromptBar);
  const openForBlock = useDirector3dUi((state) => state.openForBlock);
  const setHostBridge = useDirector3dUi((state) => state.setHostBridge);
  const characters = useWorkspaceDocument((state) => state.characters.characters);

  const node = nodes.find((item) => item.id === blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const project = useMemo(() => normalizeDirectorProject(data.scene), [data.scene]);
  const previewBlockId = resolveConnectedStoryboardPreviewForDirector3dId(
    blockId,
    nodes,
    edges,
  );
  const previewNode = previewBlockId
    ? nodes.find((item) => item.id === previewBlockId)
    : undefined;
  const previewRaw = (previewNode?.data as Record<string, unknown> | undefined)
    ?.storyboardPreview as StoryboardPreviewPayload | undefined;
  const previewPayload =
    previewRaw?.version === 1 && Array.isArray(previewRaw.frames)
      ? { ...emptyStoryboardPreview(), ...previewRaw }
      : emptyStoryboardPreview();
  const pictureBlockId = previewBlockId
    ? resolveConnectedPictureGenId(previewBlockId, nodes, edges)
    : undefined;
  const directPictureNode = nodes.find(
    (item) =>
      item.type === 'picture-gen' &&
      edges.some(
        (edge) =>
          (edge.source === blockId && edge.target === item.id) ||
          (edge.target === blockId && edge.source === item.id),
      ),
  );

  const linkedFrameId =
    (data.linkedStoryboardPreviewFrameId as string | undefined) ??
    previewPayload.selectedFrameId ??
    null;
  const linkedFrame = previewPayload.frames.find((frame) => frame.id === linkedFrameId);
  const lastCaptureUrl = data.lastCaptureUrl as string | undefined;
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
  const meta = lookupBlock(kind);

  const selectFrame = useCallback(
    (frameId: string) => {
      updateNodeData(blockId, {
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
    [blockId, previewBlockId, previewPayload, updateNodeData],
  );

  const openStage = useCallback(() => {
    const referenceUrl = linkedFrame?.imageUrl ?? linkedFrame?.referenceImageUrl ?? undefined;
    const panoramaUrl = previewPayload.panorama720?.imageUrl;
    const environmentProject = panoramaUrl
      ? { ...project, panorama: { url: panoramaUrl, yaw: 0, exposure: 1 } }
      : referenceUrl && !project.panorama
        ? { ...project, panorama: { url: referenceUrl, yaw: 0, exposure: 1 } }
        : project;
    const nextProject = prepareDirectorProjectForShot(
      environmentProject,
      linkedFrame?.characterIds,
      characters,
      linkedFrame?.director3dGuide?.characterPlacements,
      linkedFrame?.characterNames,
    );

    updateNodeData(blockId, {
      linkedStoryboardPreviewId: previewBlockId ?? null,
      linkedStoryboardPreviewFrameId: linkedFrame?.id ?? null,
      linkedShotId: linkedFrame?.sourceShotId ?? null,
    });
    if (previewBlockId && linkedFrame) {
      updateNodeData(previewBlockId, {
        storyboardPreview: { ...previewPayload, selectedFrameId: linkedFrame.id },
      });
    }
    openForBlock(
      blockId,
      nextProject,
      linkedFrame?.sourceShotId,
      previewBlockId && linkedFrame
        ? { previewBlockId, frameId: linkedFrame.id }
        : undefined,
    );
    setHostBridge(panoramaUrl ?? referenceUrl ?? null);
  }, [
    blockId,
    characters,
    linkedFrame,
    openForBlock,
    previewBlockId,
    previewPayload,
    project,
    setHostBridge,
    updateNodeData,
  ]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  return (
    <div
      className="flex flex-col w-full h-[min(500px,58vh)] min-h-[360px] px-3 py-2 nodrag"
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 shrink-0 h-8">
        <GripVertical
          size={13}
          className="text-ink/20 nx9-prompt-bar-drag-handle cursor-grab"
        />
        <p className="flex-1 text-[13px] font-medium text-ink truncate">
          {meta?.label ?? '3D 导演台'}
          <span className="ml-2 text-[10px] font-normal text-ink/40">机位设计层</span>
        </p>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded ${
            previewBlockId ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
          }`}
        >
          {previewBlockId ? '已连接分镜预览' : '独立模式'}
        </span>
        <button
          type="button"
          onClick={handleCollapse}
          className="p-1 rounded-lg text-ink/35 hover:text-ink"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="flex-1 min-h-0 mt-1.5 rounded-xl border border-line/35 bg-white overflow-hidden flex flex-col">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-line/25 bg-surface/20 text-[10px]">
          <span className="rounded-md bg-violet-500/10 text-violet-700 px-2 py-1">3D 构图</span>
          <span className="text-ink/25">→</span>
          <span
            className={`rounded-md px-2 py-1 ${
              previewBlockId ? 'bg-brand/10 text-brand' : 'bg-surface text-ink/35'
            }`}
          >
            分镜预览
          </span>
          <span className="text-ink/25">→</span>
          <span
            className={`rounded-md px-2 py-1 ${
              pictureBlockId || directPictureNode
                ? 'bg-ok/10 text-ok'
                : 'bg-surface text-ink/35'
            }`}
          >
            图像生成
          </span>
          <span className="ml-auto text-ink/40">
            {pictureBlockId
              ? '正式出图由分镜预览调度'
              : directPictureNode
                ? '截图可直接驱动单张出图'
                : '尚未连接出图节点'}
          </span>
        </div>

        {previewBlockId && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line/20">
            <label className="text-[10px] text-ink/45 shrink-0">当前分镜</label>
            <select
              value={linkedFrameId ?? ''}
              onChange={(event) => selectFrame(event.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-line/50 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
            >
              <option value="">选择要设计机位的分镜帧</option>
              {[...previewPayload.frames]
                .sort((a, b) => a.order - b.order)
                .map((frame) => (
                  <option key={frame.id} value={frame.id} disabled={frame.locked}>
                    {frame.label} · {frame.startSec.toFixed(0)}~{frame.endSec.toFixed(0)}s
                    {frame.locked ? ' · 已锁定' : ''}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex-1 min-h-0 p-3 flex flex-col">
          <div className="relative flex-1 min-h-[190px] rounded-xl overflow-hidden border border-[#2a3040] bg-[#12141a]">
            {previewUrl ? (
              <img src={previewUrl} alt="3D 机位预览" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/45">
                <Box size={34} />
                <span className="text-[11px]">打开 3D 舞台后可旋转、缩放、摆位并记录快照</span>
              </div>
            )}
            <div className="absolute left-2 top-2 flex gap-1.5 text-[9px]">
              <span className="rounded bg-black/55 text-white/80 px-1.5 py-0.5">
                {project.viewportAspectRatio}
              </span>
              <span className="rounded bg-black/55 text-white/80 px-1.5 py-0.5">
                {project.cameras.length} 机位 · {captureCount} 快照
              </span>
              {linkedFrame?.director3dGuide && (
                <span className="rounded bg-violet-600/80 text-white px-1.5 py-0.5">
                  已应用到 {linkedFrame.label}
                </span>
              )}
            </div>
          </div>

          {linkedFrame?.director3dGuide?.cameraPrompt && (
            <p className="mt-2 text-[10px] leading-relaxed text-ink/45 line-clamp-2">
              机位 Prompt：{linkedFrame.director3dGuide.cameraPrompt}
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-line/25 bg-surface/20">
          <p className="text-[10px] text-ink/40">
            {linkedFrame
              ? `记录帧后写回 ${linkedFrame.label}，再由分镜预览重新生成`
              : previewBlockId
                ? '请选择分镜帧；也可先独立搭建场景'
                : '直接连接图像生成时，快照与机位 Prompt 会作为上游输入'}
          </p>
          <div className="flex-1" />
          {lastCaptureUrl && (
            <a
              href={lastCaptureUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line text-[10px] text-ink/55 hover:text-brand"
            >
              <ImageIcon size={11} />
              导出快照
            </a>
          )}
          <button
            type="button"
            onClick={openStage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-700 text-white text-[11px] font-medium hover:bg-violet-800"
          >
            <ExternalLink size={12} />
            打开 3D 舞台
          </button>
        </div>
      </div>
    </div>
  );
}
