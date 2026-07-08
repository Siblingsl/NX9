import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Users } from 'lucide-react';
import {
  BLOCKING_CAMERA_PRESETS,
  BLOCKING_LAYOUTS,
  type BlockingLayout,
} from '@nx9/shared';
import {
  BODY_TYPES,
  POSE_PRESETS,
  buildCameraPrompt,
  emptyDirectorProject,
  normalizeDirectorProject,
  type DirectorCameraShot,
  type DirectorObject,
  type DirectorProject,
} from '@nx9/director3d';
import { BlockShell } from '../shared/BlockShell';
import { useDirector3dUi } from '../../stores/director3d-ui';

function layoutPositions(layout: BlockingLayout, count: number): [number, number, number][] {
  if (count <= 1) return [[0, 0, 0]];
  if (layout === 'dialogue') {
    return count >= 2
      ? [
          [-0.9, 0, 0],
          [0.9, 0, 0],
        ]
      : [[0, 0, 0]];
  }
  if (layout === 'triangle') {
    const pts: [number, number, number][] = [[0, 0, -0.6]];
    for (let i = 1; i < count; i++) {
      const angle = ((i - 1) / Math.max(count - 1, 1)) * Math.PI - Math.PI / 2;
      pts.push([Math.sin(angle) * 1.1, 0, Math.cos(angle) * 0.8]);
    }
    return pts.slice(0, count);
  }
  const spacing = 0.85;
  return Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * spacing, 0, 0]);
}

function buildBlockingProject(opts: {
  actorCount: number;
  poseId: string;
  bodyType: string;
  layout: BlockingLayout;
  selectedCameras: string[];
}): DirectorProject {
  const base = emptyDirectorProject();
  const positions = layoutPositions(opts.layout, opts.actorCount);
  const characters: DirectorObject[] = positions.map((pos, i) => ({
    id: `block-char-${i}`,
    name: `演员 ${i + 1}`,
    kind: 'character',
    visible: true,
    locked: false,
    color: i === 0 ? '#6366f1' : '#64748b',
    bodyType: (opts.bodyType as DirectorObject['bodyType']) ?? 'neutral',
    posePresetId: opts.poseId,
    transform: { position: pos, rotation: [0, 0, 0], scale: [1, 1, 1] },
  }));

  const camPresets = BLOCKING_CAMERA_PRESETS.filter((c) => opts.selectedCameras.includes(c.id));
  const cameras: DirectorCameraShot[] = (camPresets.length ? camPresets : BLOCKING_CAMERA_PRESETS.slice(0, 2)).map(
    (preset) => ({
      id: `block-cam-${preset.id}`,
      name: preset.name,
      fov: preset.fov,
      transform: { position: preset.position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      target: preset.target,
      captures: [],
    }),
  );

  return {
    ...base,
    objects: characters,
    cameras,
    activeCameraId: cameras[0]?.id ?? base.activeCameraId,
  };
}

function BlockingStageBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const actorCount = (props.data?.actorCount as number) ?? 2;
  const poseId = (props.data?.poseId as string) ?? 'stand';
  const bodyType = (props.data?.bodyType as string) ?? 'neutral';
  const layout = ((props.data?.blockingLayout as BlockingLayout) ?? 'dialogue') as BlockingLayout;
  const selectedCameras = (props.data?.selectedCameras as string[]) ?? ['master-wide', 'ots-left'];
  const scene = normalizeDirectorProject(props.data?.scene);
  const sequence = (props.data?.cameraSequence as { name: string; prompt: string }[] | undefined) ?? [];

  const project = useMemo(
    () =>
      props.data?.scene
        ? scene
        : buildBlockingProject({ actorCount, poseId, bodyType, layout, selectedCameras }),
    [props.data?.scene, scene, actorCount, poseId, bodyType, layout, selectedCameras],
  );

  const syncProject = useCallback(
    (patch: Record<string, unknown>) => {
      const next = buildBlockingProject({
        actorCount: (patch.actorCount as number) ?? actorCount,
        poseId: (patch.poseId as string) ?? poseId,
        bodyType: (patch.bodyType as string) ?? bodyType,
        layout: (patch.blockingLayout as BlockingLayout) ?? layout,
        selectedCameras: (patch.selectedCameras as string[]) ?? selectedCameras,
      });
      const prompts = next.cameras.map((c) => buildCameraPrompt(c));
      updateNodeData(props.id, {
        ...patch,
        scene: next,
        cameraSequence: next.cameras.map((c) => ({ name: c.name, prompt: buildCameraPrompt(c) })),
        content: prompts.join('\n'),
        output: prompts.join('\n'),
      });
    },
    [actorCount, poseId, bodyType, layout, selectedCameras, props.id, updateNodeData],
  );

  const toggleCamera = useCallback(
    (id: string) => {
      const next = selectedCameras.includes(id)
        ? selectedCameras.filter((x) => x !== id)
        : [...selectedCameras, id];
      syncProject({ selectedCameras: next });
    },
    [selectedCameras, syncProject],
  );

  const open = useCallback(() => {
    openForBlock(props.id, project);
  }, [openForBlock, props.id, project]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs nodrag nopan">
        <div className="rounded-xl border border-line bg-surface/80 aspect-video flex flex-col items-center justify-center gap-1 text-ink/40">
          <Users size={24} className="text-accent/70" />
          <span className="text-[10px]">
            {project.objects.filter((o) => o.kind === 'character').length} 演员 · {project.cameras.length} 机位
          </span>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-ink/50">
          演员
          <input
            type="number"
            min={1}
            max={6}
            value={actorCount}
            onChange={(e) => syncProject({ actorCount: Number(e.target.value) || 2 })}
            className="w-12 rounded border border-line px-1 py-0.5"
          />
        </label>
        <select
          value={layout}
          onChange={(e) => syncProject({ blockingLayout: e.target.value as BlockingLayout })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          {BLOCKING_LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          value={poseId}
          onChange={(e) => syncProject({ poseId: e.target.value })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          {POSE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={bodyType}
          onChange={(e) => syncProject({ bodyType: e.target.value })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          {BODY_TYPES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {BLOCKING_CAMERA_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCamera(c.id)}
              className={`px-2 py-0.5 rounded-full border text-[10px] ${
                selectedCameras.includes(c.id)
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line hover:border-accent/30'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {sequence.length > 0 && (
          <ul className="text-[10px] text-ink/50 space-y-0.5 max-h-16 overflow-y-auto nx9-scroll">
            {sequence.map((s) => (
              <li key={s.name} className="truncate">
                {s.name}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={open} className="w-full rounded-xl bg-accent text-white py-2">
          打开场面调度
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(BlockingStageBlock);
