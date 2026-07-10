import { memo, useCallback } from 'react'; import { type NodeProps, useReactFlow } from '@xyflow/react'; import { BlockShell } from '../shared/BlockShell'; import { useActivityLog } from '../../stores/activity-log'; import { api } from '../../api/client';
function ControlPreprocessBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow(); const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const src = upstream?.pictures?.[0] || (props.data?.imageUrl as string);
  const mode = (props.data?.mode as string) ?? 'depth'; const resultUrl = props.data?.previewUrl as string | undefined;
  const run = useCallback(async () => {
    if (!src) { appendLog('ControlNet：无上游图片'); return; }
    updateNodeData(props.id, { status: 'running' });
    try {
      if (mode === 'depth') { const r = await api.generateDepthPass({ sourceUrl: src }); updateNodeData(props.id, { status: 'success', previewUrl: r.depthUrl, output: r.depthUrl, meta: { mode } }); }
      else if (mode === 'canny') { const r = await api.proxyFal({ model: 'fal-ai/image-to-canny', input: { image_url: src } }); updateNodeData(props.id, { status: 'success', previewUrl: r.url, output: r.url, meta: { mode } }); }
      else throw new Error(`未知模式: ${mode}`);
      appendLog(`ControlNet ${mode} 完成`);
    } catch (e) { updateNodeData(props.id, { status: 'error', error: String(e) }); appendLog(`ControlNet 失败: ${String(e)}`); }
  }, [src, mode, props.id, updateNodeData, appendLog]);
  return (<BlockShell {...props}><div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
    {resultUrl && <img src={resultUrl} alt="" className="w-full rounded-lg max-h-28 object-cover" />}
    <select value={mode} onChange={(e) => updateNodeData(props.id, { mode: e.target.value })} className="w-full rounded-lg border border-line px-2 py-1 text-[10px] bg-white">
      <option value="depth">深度图</option><option value="canny">边缘图</option>
    </select>
    <button type="button" onClick={() => void run()} disabled={!src} className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50">预处理</button>
  </div></BlockShell>);
}
export default memo(ControlPreprocessBlock);
