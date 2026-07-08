import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

function ContinuityCheckBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as {
    pictures?: string[];
    clips?: string[];
    prompts?: string[];
  } | undefined;
  const report = (props.data?.continuityReport as string) ?? '';
  const issues = (props.data?.continuityIssues as string[] | undefined) ?? [];

  const runCheck = useCallback(async () => {
    const images = upstream?.pictures ?? [];
    if (images.length < 2) {
      appendLog('连贯性检查：至少需要 2 张上游图像');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.proxyLlm({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '你是分镜 continuity supervisor。对比多张镜头静帧，列出服装、光影、轴线、道具不一致之处。输出 JSON: {"summary":"...","issues":["..."]}',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `检查 ${images.length} 个镜头的连贯性。上下文：${upstream?.prompts?.join(' ') ?? ''}` },
              ...images.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      });
      const raw = (res as { content?: string }).content ?? JSON.stringify(res);
      let summary = raw;
      let parsedIssues: string[] = [];
      try {
        const json = JSON.parse(raw) as { summary?: string; issues?: string[] };
        summary = json.summary ?? raw;
        parsedIssues = json.issues ?? [];
      } catch {
        parsedIssues = raw.split('\n').filter((l) => l.trim().startsWith('-'));
      }
      updateNodeData(props.id, {
        status: 'success',
        continuityReport: summary,
        continuityIssues: parsedIssues,
        content: summary,
        meta: { issueCount: parsedIssues.length, checkedImages: images.length },
      });
      appendLog(`连贯性检查完成 · ${parsedIssues.length} 项`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [upstream, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-[10px] text-ink/50">
          上游 {upstream?.pictures?.length ?? 0} 图 · {upstream?.clips?.length ?? 0} 视频
        </p>
        <button type="button" onClick={() => void runCheck()} className="w-full rounded-xl bg-brand text-white py-2">
          运行连贯性检查
        </button>
        {report && (
          <p className="text-[10px] text-ink/70 bg-surface rounded-lg p-2 whitespace-pre-wrap max-h-32 overflow-y-auto nx9-scroll">
            {report}
          </p>
        )}
        {issues.length > 0 && (
          <ul className="text-[10px] text-warn space-y-0.5 list-disc pl-4">
            {issues.slice(0, 8).map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(ContinuityCheckBlock);
