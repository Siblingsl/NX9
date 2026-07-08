import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function GridComposeBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const rows = (props.data?.rows as number) ?? 3;
  const cols = (props.data?.cols as number) ?? 3;
  const status = props.data?.status as string | undefined;
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const composedUrl = props.data?.composedUrl as string | undefined;
  const imageUrls = upstream?.pictures ?? (props.data?.imageUrls as string[]) ?? [];

  const run = useCallback(async () => {
    if (imageUrls.length === 0) {
      appendLog('宫格拼接：缺少上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.gridCompose({ imageUrls, rows, cols });
      updateNodeData(props.id, {
        status: 'success',
        composedUrl: res.url,
        previewUrl: res.url,
      });
      appendLog('宫格拼接完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`宫格拼接失败: ${String(e)}`);
    }
  }, [imageUrls, rows, cols, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <p className="text-[10px] text-ink/50">上游图片: {imageUrls.length} 张</p>
        <div className="flex gap-2">
          <label className="text-[10px] text-ink/50 flex-1">
            行
            <input
              type="number"
              min={1}
              max={6}
              value={rows}
              onChange={(e) => updateNodeData(props.id, { rows: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5"
            />
          </label>
          <label className="text-[10px] text-ink/50 flex-1">
            列
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              onChange={(e) => updateNodeData(props.id, { cols: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 text-xs mt-0.5"
            />
          </label>
        </div>
        {composedUrl && (
          <img src={composedUrl} alt="" className="w-full rounded-lg border border-line max-h-32 object-cover" />
        )}
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-warn text-white text-sm py-2 disabled:opacity-50"
        >
          {status === 'running' ? '拼接中…' : '拼接宫格'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(GridComposeBlock);
