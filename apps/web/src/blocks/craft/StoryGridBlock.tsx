import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { api } from '../../api/client';

function StoryGridBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const rows = (props.data?.rows as number) ?? 3;
  const cols = (props.data?.cols as number) ?? 3;
  const status = props.data?.status as string | undefined;
  const previewUrl = props.data?.previewUrl as string | undefined;
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const prompt = upstreamPrompt || (props.data?.content as string) || '';

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.gridGenerate({
        prompt: prompt || 'storyboard grid, 9 panels, cinematic',
        rows,
        cols,
      });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        content: prompt,
        message: res.message,
      });
      appendLog('分镜网格生成完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`分镜网格失败: ${String(e)}`);
    }
  }, [prompt, rows, cols, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(props.id, { content: e.target.value })}
          placeholder="分镜网格描述…"
          className="w-full text-xs rounded-lg border border-line p-2 min-h-[48px]"
        />
        <div className="flex gap-2 text-[10px] text-ink/50">
          <span>{rows}×{cols} 宫格</span>
        </div>
        {previewUrl && (
          <img src={previewUrl} alt="" className="w-full rounded-lg border border-line max-h-36 object-cover" />
        )}
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="w-full rounded-xl bg-accent text-white text-sm py-2 disabled:opacity-50"
        >
          {status === 'running' ? '生成中…' : '生成分镜网格'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(StoryGridBlock);
