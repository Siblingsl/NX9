import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function ScaleFitBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const sourceUrl = upstream?.pictures?.[0] || (props.data?.sourceUrl as string);
  const width = (props.data?.width as number) ?? 1024;
  const height = (props.data?.height as number) ?? 1024;
  const fit = (props.data?.fit as string) ?? 'cover';
  const outputUrl = (props.data?.previewUrl as string) || (props.data?.outputUrl as string);
  const status = props.data?.status as string | undefined;

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('尺寸调整：缺少上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.resizeImage({
        sourceUrl,
        width,
        height,
        fit: fit as 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
      });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
      });
      appendLog(`尺寸调整完成 · ${res.width}×${res.height}`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`尺寸调整失败: ${String(e)}`);
    }
  }, [sourceUrl, width, height, fit, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-ink/60">
            宽
            <input
              type="number"
              min={16}
              max={4096}
              value={width}
              onChange={(e) => updateNodeData(props.id, { width: Number(e.target.value) })}
              className="mt-0.5 w-full rounded-lg border border-line px-2 py-1"
            />
          </label>
          <label className="text-ink/60">
            高
            <input
              type="number"
              min={16}
              max={4096}
              value={height}
              onChange={(e) => updateNodeData(props.id, { height: Number(e.target.value) })}
              className="mt-0.5 w-full rounded-lg border border-line px-2 py-1"
            />
          </label>
        </div>
        <label className="text-ink/60 block">
          适配
          <select
            value={fit}
            onChange={(e) => updateNodeData(props.id, { fit: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="cover">裁切填充</option>
            <option value="contain">完整包含</option>
            <option value="fill">拉伸</option>
            <option value="inside">缩小适应</option>
            <option value="outside">放大适应</option>
          </select>
        </label>
        {sourceUrl && (
          <img src={sourceUrl} alt="" className="w-full rounded-lg border border-line max-h-20 object-cover" />
        )}
        {outputUrl && outputUrl !== sourceUrl && (
          <img src={outputUrl} alt="" className="w-full rounded-lg border border-brand/30 max-h-24 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-warn text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '处理中…' : '调整尺寸'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(ScaleFitBlock);
