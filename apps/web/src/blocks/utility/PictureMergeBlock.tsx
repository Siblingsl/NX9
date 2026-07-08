import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function PictureMergeBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const direction = (props.data?.direction as string) ?? 'horizontal';
  const cols = (props.data?.cols as number) ?? 2;
  const mergedUrl = (props.data?.composedUrl as string) || (props.data?.previewUrl as string);
  const status = props.data?.status as string | undefined;
  const imageUrls = upstream?.pictures ?? [];

  const run = useCallback(async () => {
    if (imageUrls.length < 2) {
      appendLog('图像合并：需要至少 2 张上游图片');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.mergeImages({
        imageUrls,
        direction: direction as 'horizontal' | 'vertical' | 'grid',
        cols,
      });
      updateNodeData(props.id, {
        status: 'success',
        composedUrl: res.url,
        previewUrl: res.url,
      });
      appendLog(`图像合并完成 · ${res.count} 张`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`图像合并失败: ${String(e)}`);
    }
  }, [imageUrls, direction, cols, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <label className="text-ink/60 block">
          布局
          <select
            value={direction}
            onChange={(e) => updateNodeData(props.id, { direction: e.target.value })}
            className="mt-0.5 w-full rounded-lg border border-line px-2 py-1 bg-white"
          >
            <option value="horizontal">横向拼接</option>
            <option value="vertical">纵向拼接</option>
            <option value="grid">网格</option>
          </select>
        </label>
        {direction === 'grid' && (
          <label className="text-ink/60 block">
            列数
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              onChange={(e) => updateNodeData(props.id, { cols: Number(e.target.value) })}
              className="mt-0.5 w-full rounded-lg border border-line px-2 py-1"
            />
          </label>
        )}
        <p className="text-ink/50">上游图片：{imageUrls.length} 张</p>
        {imageUrls.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            {imageUrls.slice(0, 4).map((u) => (
              <img key={u} src={u} alt="" className="h-12 w-12 rounded border border-line object-cover shrink-0" />
            ))}
          </div>
        )}
        {mergedUrl && (
          <img src={mergedUrl} alt="" className="w-full rounded-lg border border-line max-h-28 object-cover" />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === 'running' || imageUrls.length < 2}
          className="w-full rounded-xl bg-warn text-white py-2 disabled:opacity-50"
        >
          {status === 'running' ? '合并中…' : '合并图像'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(PictureMergeBlock);
