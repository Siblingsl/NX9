import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function ThumbnailMakerBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const src = upstream?.pictures?.[0] || (props.data?.imageUrl as string);
  const title = (props.data?.title as string) ?? '';
  const outputUrl = props.data?.previewUrl as string | undefined;

  const run = useCallback(async () => {
    if (!src) { appendLog('封面制作：无上游图片'); return; }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.thumbnailCompose({ imageUrl: src, title: title.trim() || undefined });
      updateNodeData(props.id, { status: 'success', previewUrl: res.url, output: res.url, content: title });
      appendLog('封面制作完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`封面制作失败: ${String(e)}`);
    }
  }, [src, title, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        {outputUrl && <img src={outputUrl} alt="" className="w-full rounded-lg border border-line max-h-36 object-cover" />}
        <input value={title} onChange={(e) => updateNodeData(props.id, { title: e.target.value })} placeholder="封面标题" className="w-full rounded-lg border border-line px-2 py-1" />
        <button type="button" onClick={() => void run()} disabled={!src} className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50">制作封面</button>
      </div>
    </BlockShell>
  );
}

export default memo(ThumbnailMakerBlock);
