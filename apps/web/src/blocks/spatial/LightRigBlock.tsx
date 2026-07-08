import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Sun } from 'lucide-react';
import { LIGHT_RIG_PRESETS, buildLightRigPrompt } from '@nx9/shared';
import {
  emptyDirectorProject,
  normalizeDirectorProject,
  type DirectorProject,
} from '@nx9/director3d';
import { BlockShell } from '../shared/BlockShell';
import { useDirector3dUi } from '../../stores/director3d-ui';

function applyLightToProject(presetId: string, hdriUrl?: string): DirectorProject {
  const preset = LIGHT_RIG_PRESETS.find((p) => p.id === presetId) ?? LIGHT_RIG_PRESETS[0];
  const base = emptyDirectorProject();
  return {
    ...base,
    scene: {
      ...base.scene,
      backgroundColor: preset.backgroundColor ?? base.scene.backgroundColor,
    },
    panorama: hdriUrl
      ? { url: hdriUrl, yaw: 0, exposure: preset.exposure ?? 1 }
      : null,
  };
}

function LightRigBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const openForBlock = useDirector3dUi((s) => s.openForBlock);
  const presetId = (props.data?.lightPresetId as string) ?? LIGHT_RIG_PRESETS[0].id;
  const extra = (props.data?.extra as string) ?? '';
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const lastCaptureUrl = props.data?.lastCaptureUrl as string | undefined;
  const hdriUrl = (props.data?.hdriUrl as string) ?? upstream?.pictures?.[0];

  const prompt = useMemo(
    () => buildLightRigPrompt(presetId, extra || upstream?.prompts?.[0]),
    [presetId, extra, upstream?.prompts],
  );

  const project = useMemo(() => {
    if (props.data?.scene) return normalizeDirectorProject(props.data.scene);
    return applyLightToProject(presetId, hdriUrl);
  }, [props.data?.scene, presetId, hdriUrl]);

  const sync = useCallback(
    (nextPresetId: string, nextExtra: string) => {
      const content = buildLightRigPrompt(nextPresetId, nextExtra || upstream?.prompts?.[0]);
      const nextProject = applyLightToProject(nextPresetId, hdriUrl);
      updateNodeData(props.id, {
        lightPresetId: nextPresetId,
        extra: nextExtra,
        scene: nextProject,
        content,
        output: content,
        outputPrompt: content,
      });
    },
    [hdriUrl, upstream?.prompts, props.id, updateNodeData],
  );

  const open = useCallback(() => {
    openForBlock(props.id, project);
  }, [openForBlock, props.id, project]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs nodrag nopan">
        <div className="rounded-xl border border-line bg-surface/80 aspect-video flex flex-col items-center justify-center overflow-hidden">
          {lastCaptureUrl ? (
            <img src={lastCaptureUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <>
              <Sun size={24} className="text-brand/60" />
              <span className="text-[10px] text-ink/40 mt-1">灯光预览 / 截图</span>
            </>
          )}
        </div>
        <select
          value={presetId}
          onChange={(e) => sync(e.target.value, extra)}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          {LIGHT_RIG_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <textarea
          value={extra}
          onChange={(e) => sync(presetId, e.target.value)}
          placeholder="灯光补充…"
          className="w-full min-h-[40px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        <p className="text-[10px] text-ink/50 line-clamp-2">{prompt}</p>
        {hdriUrl && <p className="text-[10px] text-brand/60 truncate">HDRI: {hdriUrl}</p>}
        <button type="button" onClick={open} className="w-full rounded-xl bg-brand text-white py-2">
          打开灯光预演
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(LightRigBlock);
