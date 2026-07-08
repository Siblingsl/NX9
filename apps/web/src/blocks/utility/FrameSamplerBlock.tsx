import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function FrameSamplerBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const videoUrl = upstream?.clips?.[0] || (props.data?.videoUrl as string);
  const frameCount = (props.data?.frameCount as number) ?? 6;
  const frames = (props.data?.frameUrls as string[]) ?? [];

  const extract = useCallback(async () => {
    if (!videoUrl) {
      appendLog('抽帧：缺少视频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.extractFrames(videoUrl, frameCount);
      if (!res.ok) throw new Error(res.message ?? '抽帧失败');
      updateNodeData(props.id, {
        status: 'success',
        frameUrls: res.frames,
        previewUrl: res.frames[0],
        pictures: res.frames,
      });
      appendLog(`抽帧完成 · ${res.frames.length} 张`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [videoUrl, frameCount, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="text-ink/60 block">
          帧数
          <input
            type="number"
            min={1}
            max={24}
            value={frameCount}
            onChange={(e) => updateNodeData(props.id, { frameCount: Number(e.target.value) })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1"
          />
        </label>
        {frames.length > 0 && (
          <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto nx9-scroll">
            {frames.map((u) => (
              <img key={u} src={u} alt="" className="rounded border border-line aspect-video object-cover" />
            ))}
          </div>
        )}
        <button type="button" onClick={() => void extract()} className="w-full rounded-xl bg-warn text-white py-2">
          抽取帧序列
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(FrameSamplerBlock);
