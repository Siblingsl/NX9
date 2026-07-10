import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function FrameEndpointsBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[] } | undefined;
  const videoUrl = upstream?.clips?.[0] || (props.data?.videoUrl as string);
  const frames = (props.data?.frameUrls as string[]) ?? [];
  const frameCount = (props.data?.frameCount as number) ?? 2;

  const extract = useCallback(async () => {
    if (!videoUrl) {
      appendLog('首尾帧：缺少视频');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.extractFrames(videoUrl, frameCount);
      if (!res.ok) throw new Error(res.message ?? '抽帧失败');
      updateNodeData(props.id, {
        status: 'success',
        frameUrls: res.frames,
        firstFrameUrl: res.frames[0],
        lastFrameUrl: res.frames[res.frames.length - 1],
        previewUrl: res.frames[0],
      });
      appendLog(`首尾帧完成 · ${res.frames.length} 张`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [videoUrl, frameCount, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="text-ink/60">
          抽帧数
          <input
            type="number"
            min={1}
            max={8}
            value={frameCount}
            onChange={(e) => updateNodeData(props.id, { frameCount: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
          />
        </label>
        <div className="grid grid-cols-2 gap-1">
          {frames.slice(0, 2).map((u, i) => (
            <div key={u} className="relative">
              <img src={u} alt="" className="rounded border border-line aspect-video object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                {i === 0 ? '首帧' : '尾帧'}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void extract()}
          className="w-full rounded-xl bg-warn text-white py-2"
        >
          抽取首尾帧
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(FrameEndpointsBlock);
