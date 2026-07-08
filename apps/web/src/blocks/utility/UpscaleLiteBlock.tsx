import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function UpscaleLiteBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const scale = (props.data?.scale as number) ?? 2;
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('放大：请连接上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.upscaleImage({ sourceUrl, scale });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
      });
      appendLog(`放大完成 · ${res.width}×${res.height}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`放大失败: ${String(e)}`);
    }
  }, [sourceUrl, scale, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        <label className="text-ink/60 block">
          倍数
          <select
            value={scale}
            onChange={(e) => updateNodeData(props.id, { scale: Number(e.target.value) })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        {outputUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || !sourceUrl}
          className="w-full rounded-xl bg-brand text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '放大中…' : '运行放大'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(UpscaleLiteBlock);
