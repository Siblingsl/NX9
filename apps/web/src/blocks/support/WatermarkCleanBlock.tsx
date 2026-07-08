import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function WatermarkCleanBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('去水印：请连接上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.stripMetadata({ sourceUrl });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
      });
      appendLog('元数据已清理');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`清理失败: ${String(e)}`);
    }
  }, [sourceUrl, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        <p className="text-ink/50 leading-relaxed">重编码并移除 EXIF / 元数据（非 AI 去水印）</p>
        {outputUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || !sourceUrl}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '处理中…' : '清理元数据'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(WatermarkCleanBlock);
