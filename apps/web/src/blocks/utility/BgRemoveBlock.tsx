import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { resolveRunLabel } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { toastError } from '../../stores/toast';

function BgRemoveBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;
  const runLabel = resolveRunLabel('bg-remove', status).primary;

  const run = useCallback(async () => {
    if (!sourceUrl) {
      const msg = '抠图：请连接上游图片，禁止空成功';
      updateNodeData(props.id, { status: 'error', error: msg });
      appendLog(msg);
      toastError(msg);
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.proxyFal({
        model: 'fal-ai/birefnet/v2',
        input: { image_url: sourceUrl },
      });
      if (!res.ok || !res.url) throw new Error('Fal 未返回图片，禁止空成功');
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
      });
      appendLog('抠图完成');
    } catch (e) {
      const msg = `抠图失败: ${String(e)}`;
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(msg);
      toastError(msg);
    }
  }, [sourceUrl, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        {outputUrl ? (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        ) : sourceUrl ? (
          <p className="text-ink/50 truncate">输入: {sourceUrl.split('/').pop()}</p>
        ) : (
          <p className="text-ink/50">连接 picture 输入</p>
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || !sourceUrl}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {runLabel}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(BgRemoveBlock);
