import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function BridgeClipBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const endFrameUrl = props.data?.endFrameUrl as string | undefined;
  const continuationPrompt = props.data?.continuationPrompt as string | undefined;
  const status = props.data?.status as string | undefined;
  const upstream = props.data?.upstream as { clips?: string[]; prompts?: string[] } | undefined;
  const clipUrl = upstream?.clips?.[0] || (props.data?.sourceClipUrl as string);

  const run = useCallback(async () => {
    const url = clipUrl;
    if (!url) { appendLog('Bridge 续拍：无上游视频'); return; }
    updateNodeData(props.id, { status: 'running' });
    try {
      const framesRes = await api.extractFrames(url, 1);
      const frame = framesRes.frames?.[0];
      if (!frame) throw new Error('抽帧失败');
      const nextPrompt = upstream?.prompts?.[0] || (props.data?.content as string) || '';
      const { buildBridgeContinuationPrompt } = await import('@nx9/shared');
      const cp = buildBridgeContinuationPrompt({
        sourcePrompt: (props.data?.content as string) ?? '',
        nextPrompt,
      });
      updateNodeData(props.id, {
        status: 'success',
        endFrameUrl: frame,
        continuationPrompt: cp,
        sourceClipUrl: clipUrl,
        output: cp,
        content: cp,
        previewUrl: frame,
        pictures: [frame],
      });
      appendLog('Bridge 续拍参数已生成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`Bridge 失败: ${String(e)}`);
    }
  }, [clipUrl, upstream, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        {clipUrl && <p className="text-[10px] text-ink/50 truncate">源视频: {clipUrl}</p>}
        {endFrameUrl && (
          <img src={endFrameUrl} alt="" className="w-full rounded-lg border border-line max-h-28 object-cover" />
        )}
        {continuationPrompt && (
          <pre className="text-[10px] text-ink/70 whitespace-pre-wrap bg-surface rounded-lg p-2 max-h-24 overflow-y-auto">
            {continuationPrompt}
          </pre>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || !clipUrl}
          className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50"
        >
          {status === 'running' ? '处理中…' : '提取尾帧 + Continuation'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(BridgeClipBlock);
