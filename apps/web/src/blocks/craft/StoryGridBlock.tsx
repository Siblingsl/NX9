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
  const gridStyle = (props.data?.style as 'cinematic' | 'line-art') ?? 'cinematic';

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.gridGenerate({
        prompt: prompt || 'storyboard grid, 9 panels, cinematic',
        rows,
        cols,
        style: gridStyle,
      });
      updateNodeData(props.id, {
        status: 'success',
        previewUrl: res.url,
        content: prompt,
        message: res.message,
        meta: { rows, cols, style: gridStyle },
        style: gridStyle,
      });
      appendLog(gridStyle === 'line-art' ? '线稿分镜网格生成完成' : '分镜网格生成完成');
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`分镜网格失败: ${String(e)}`);
    }
  }, [prompt, rows, cols, gridStyle, props.id, updateNodeData, appendLog]);

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
          <select
            value={gridStyle}
            onChange={(e) => updateNodeData(props.id, { style: e.target.value })}
            className="text-[10px] rounded border border-line px-1 py-0.5"
          >
            <option value="cinematic">电影感</option>
            <option value="line-art">线稿</option>
          </select>
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
