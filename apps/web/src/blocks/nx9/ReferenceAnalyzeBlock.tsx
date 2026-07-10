import { memo, useCallback } from 'react'; import { type NodeProps, useReactFlow } from '@xyflow/react'; import { BlockShell } from '../shared/BlockShell'; import { useActivityLog } from '../../stores/activity-log'; import { api } from '../../api/client';
function ReferenceAnalyzeBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow(); const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { clips?: string[]; prompts?: string[] } | undefined;
  const url = upstream?.clips?.[0] || (props.data?.videoUrl as string);
  const notes = (props.data?.notes as string) ?? '';
  const result = props.data?.analyzeResult as string | undefined;
  const run = useCallback(async () => {
    if (!url) { appendLog('参考反推：无上游视频'); return; }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.analyzeReferenceVideo({ videoUrl: url, notes: notes || undefined, targetShotCount: 5 });
      updateNodeData(props.id, { status: 'success', analyzeResult: res.markdown, output: res.markdown, content: res.markdown });
      appendLog('参考片反推完成');
    } catch (e) { updateNodeData(props.id, { status: 'error', error: String(e) }); appendLog(`参考反推失败: ${String(e)}`); }
  }, [url, notes, props.id, updateNodeData, appendLog]);
  return (<BlockShell {...props}><div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
    <input value={notes} onChange={(e) => updateNodeData(props.id, { notes: e.target.value })} placeholder="备注（可选）" className="w-full rounded-lg border border-line px-2 py-1" />
    {result && <pre className="text-[10px] text-ink/70 whitespace-pre-wrap bg-surface rounded-lg p-2 max-h-32 overflow-y-auto">{result}</pre>}
    <button type="button" onClick={() => void run()} disabled={!url} className="w-full rounded-xl bg-brand text-white py-1.5 disabled:opacity-50">反推分镜草案</button>
  </div></BlockShell>);
}
export default memo(ReferenceAnalyzeBlock);
