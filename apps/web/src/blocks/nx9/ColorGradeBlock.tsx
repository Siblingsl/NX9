import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

const LUT_PRESETS = [
  { id: 'none', label: '无 LUT', brightness: 0, contrast: 1, saturation: 1 },
  { id: 'warm', label: '暖色调', brightness: 0.05, contrast: 1.1, saturation: 1.2 },
  { id: 'cold', label: '冷色调', brightness: -0.05, contrast: 1.15, saturation: 0.9 },
  { id: 'vintage', label: '复古胶片', brightness: -0.1, contrast: 1.3, saturation: 0.7 },
] as const;

function ColorGradeBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[]; clips?: string[] } | undefined;
  const brightness = (props.data?.brightness as number) ?? 0;
  const contrast = (props.data?.contrast as number) ?? 1;
  const saturation = (props.data?.saturation as number) ?? 1;
  const lutPreset = (props.data?.lutPreset as string) ?? 'none';
  const outputUrl = (props.data?.outputUrl as string) ?? upstream?.clips?.[0] ?? upstream?.pictures?.[0];

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = LUT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      updateNodeData(props.id, {
        lutPreset: presetId,
        brightness: preset.brightness,
        contrast: preset.contrast,
        saturation: preset.saturation,
      });
      appendLog(`LUT 预设: ${preset.label}`);
    },
    [props.id, updateNodeData, appendLog],
  );

  const run = useCallback(async () => {
    const source = upstream?.clips?.[0] ?? upstream?.pictures?.[0];
    if (!source) {
      appendLog('调色：需要上游图像或视频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.colorGrade({ sourceUrl: source, brightness, contrast, saturation });
      if (!res.ok || !res.url) throw new Error(res.message ?? '调色失败');
      const patch =
        res.mediaKind === 'clip'
          ? { clips: [res.url], outputUrl: res.url }
          : { pictures: [res.url], outputUrl: res.url };
      updateNodeData(props.id, { status: 'success', ...patch });
      appendLog('调色完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream, brightness, contrast, saturation, props.id, updateNodeData, appendLog]);

  const slider = (label: string, key: 'brightness' | 'contrast' | 'saturation', min: number, max: number, step: number) => (
    <label className="block text-[10px] text-ink/50">
      {label} {(props.data?.[key] as number)?.toFixed?.(2) ?? (key === 'brightness' ? brightness : key === 'contrast' ? contrast : saturation)}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={key === 'brightness' ? brightness : key === 'contrast' ? contrast : saturation}
        onChange={(e) => updateNodeData(props.id, { [key]: Number(e.target.value) })}
        className="w-full"
      />
    </label>
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-1">
          {LUT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`flex-1 py-1 rounded-lg text-[10px] border ${
                lutPreset === p.id ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {slider('亮度', 'brightness', -0.5, 0.5, 0.05)}
        {slider('对比', 'contrast', 0.5, 2, 0.05)}
        {slider('饱和', 'saturation', 0, 2, 0.05)}
        {outputUrl && /\.mp4|clip|video/i.test(outputUrl) ? (
          <video src={outputUrl} controls className="w-full rounded-lg border border-line max-h-24" />
        ) : outputUrl ? (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-24 object-cover" />
        ) : null}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          应用调色
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ColorGradeBlock);
