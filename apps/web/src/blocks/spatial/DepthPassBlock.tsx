import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { Layers } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function DepthPassBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const depthUrl = props.data?.depthUrl as string | undefined;
  const normalUrl = props.data?.normalUrl as string | undefined;
  const sourceUrl = upstream?.pictures?.[0];

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('深度通道：需要上游图像（可先经 mesh-viewer 快照）');
      return;
    }
    try {
      const ffmpegRes = await api.ffmpegStatus();
      if (!ffmpegRes.available) {
        updateNodeData(props.id, { status: 'error', error: 'FFmpeg 未安装或不可用' });
        appendLog('深度通道：FFmpeg 不可用，请安装 FFmpeg');
        return;
      }
    } catch {
      updateNodeData(props.id, { status: 'error', error: 'FFmpeg 检测失败' });
      appendLog('深度通道：FFmpeg 检测失败');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.generateDepthPass({ sourceUrl });
      if (!res.ok) throw new Error(res.message ?? '深度通道生成失败');
      updateNodeData(props.id, {
        status: 'success',
        depthUrl: res.depthUrl,
        normalUrl: res.normalUrl,
        pictures: [res.depthUrl!, res.normalUrl!].filter(Boolean),
        meta: { sourceUrl, method: res.method },
        content: `depth + normal from ${sourceUrl}`,
      });
      appendLog('深度 / 法线通道已生成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [sourceUrl, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs nodrag nopan">
        <div className="rounded-xl border border-line bg-surface/80 aspect-video flex items-center justify-center gap-2 text-ink/40">
          {depthUrl ? (
            <div className="grid grid-cols-2 gap-1 w-full h-full p-1">
              <img src={depthUrl} alt="depth" className="rounded object-cover w-full h-full" />
              {normalUrl && (
                <img src={normalUrl} alt="normal" className="rounded object-cover w-full h-full" />
              )}
            </div>
          ) : (
            <>
              <Layers size={24} className="text-accent/70" />
              <span className="text-[10px]">depth / normal</span>
            </>
          )}
        </div>
        <p className="text-[10px] text-ink/50 truncate">{sourceUrl ? '源图已连接' : '等待上游图像'}</p>
        <button
          type="button"
          onClick={() => void run()}
          disabled={!sourceUrl}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-40"
        >
          生成深度通道
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(DepthPassBlock);
