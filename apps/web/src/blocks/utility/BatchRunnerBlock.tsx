import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';

type BatchMode = 'resize' | 'grid-split' | 'reverse-prompt';

function BatchRunnerBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const upstream = props.data?.upstream as { pictures?: string[] } | undefined;
  const pictures = upstream?.pictures ?? [];
  const mode = (props.data?.mode as BatchMode) ?? 'resize';
  const [running, setRunning] = useState(false);
  const results = (props.data?.batchResults as string[]) ?? [];

  const run = useCallback(async () => {
    if (pictures.length === 0) {
      appendLog('批量处理：无上游图片');
      return;
    }
    setRunning(true);
    updateNodeData(props.id, { status: 'running' });
    const out: string[] = [];
    try {
      for (let i = 0; i < pictures.length; i++) {
        const url = pictures[i];
        if (mode === 'resize') {
          const res = await api.resizeImage({ sourceUrl: url, width: 1024, height: 1024, fit: 'cover' });
          out.push(res.url);
        } else if (mode === 'grid-split') {
          const res = await api.gridSplit({ sourceUrl: url, rows: 2, cols: 2 });
          out.push(...res.urls);
        } else {
          const res = await api.reversePrompt(url);
          out.push(res.prompt);
        }
      }
      updateNodeData(props.id, {
        status: 'success',
        batchResults: out,
        pictures: mode === 'reverse-prompt' ? undefined : out,
        content: mode === 'reverse-prompt' ? out.join('\n\n') : undefined,
      });
      appendLog(`批量处理完成 · ${out.length} 项`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`批量处理失败: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  }, [pictures, mode, props.id, updateNodeData, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <select
          value={mode}
          onChange={(e) => updateNodeData(props.id, { mode: e.target.value })}
          className="w-full rounded-lg border border-line px-2 py-1 bg-white"
        >
          <option value="resize">批量缩放</option>
          <option value="grid-split">批量 2×2 切分</option>
          <option value="reverse-prompt">批量反推 Prompt</option>
        </select>
        <p className="text-ink/50">待处理：{pictures.length} 张</p>
        {results.length > 0 && mode !== 'reverse-prompt' && (
          <div className="flex gap-1 overflow-x-auto">
            {results.slice(0, 6).map((u) => (
              <img key={u} src={u} alt="" className="h-10 w-10 rounded object-cover border border-line shrink-0" />
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={running || pictures.length === 0}
          onClick={() => void run()}
          className="w-full rounded-xl bg-warn text-white py-2 disabled:opacity-50"
        >
          {running ? '处理中…' : '开始批量处理'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(BatchRunnerBlock);
