import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function AudioMixBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { sounds?: string[] } | undefined;
  const normalize = (props.data?.normalize as boolean | undefined) ?? true;
  const outputUrl = props.data?.outputSound as string | undefined;

  const run = useCallback(async () => {
    const tracks = upstream?.sounds ?? [];
    if (tracks.length < 2) {
      appendLog('音频混音：至少需要 2 条上游音频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.mixAudio(tracks, normalize);
      if (!res.ok || !res.url) throw new Error(res.message ?? '混音失败');
      updateNodeData(props.id, {
        status: 'success',
        outputSound: res.url,
        sounds: [res.url],
        meta: { trackCount: res.trackCount },
      });
      appendLog(`音频混音完成 · ${res.trackCount} 轨`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream?.sounds, normalize, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">上游 {upstream?.sounds?.length ?? 0} 条音频</p>
        <label className="flex items-center gap-2 text-[10px]">
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => updateNodeData(props.id, { normalize: e.target.checked })}
          />
          响度归一 (amix normalize)
        </label>
        {outputUrl && <audio src={outputUrl} controls className="w-full" />}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          混音
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(AudioMixBlock);
