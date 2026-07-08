import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import type { GridCellPrompt } from '@nx9/shared';
import { gridCellsToStoryboardShots } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';

function GridPromptReverseBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const addShots = useWorkspaceDocument((s) => s.addShots);
  const upstream = props.data?.upstream as { pictures?: string[]; prompts?: string[] } | undefined;
  const sourceUrl =
    upstream?.pictures?.[0] || (props.data?.previewUrl as string) || (props.data?.sourceUrl as string);
  const rows = (props.data?.rows as number) ?? 3;
  const cols = (props.data?.cols as number) ?? 3;
  const storyPrompt = upstream?.prompts?.join('\n') || (props.data?.storyPrompt as string) || '';
  const cells = (props.data?.gridCells as GridCellPrompt[]) ?? [];
  const splitUrls = (props.data?.splitUrls as string[]) ?? [];
  const [expanded, setExpanded] = useState<number | null>(null);

  const run = useCallback(async () => {
    if (!sourceUrl) {
      appendLog('宫格反推：请连接宫格/分镜图');
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    try {
      const res = await api.gridReversePrompts({
        sourceUrl,
        rows,
        cols,
        storyPrompt: storyPrompt || undefined,
      });
      updateNodeData(props.id, {
        status: 'success',
        gridCells: res.cells,
        splitUrls: res.splitUrls,
        pictures: res.splitUrls,
        content: res.cells.map((c) => c.videoPrompt).join('\n\n'),
      });
      appendLog(`宫格三层反推完成 · ${res.cells.length} 格`);
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`宫格反推失败: ${String(e)}`);
    }
  }, [sourceUrl, rows, cols, storyPrompt, props.id, updateNodeData, appendLog]);

  const importStoryboard = useCallback(() => {
    if (cells.length === 0) return;
    const shots = gridCellsToStoryboardShots(cells);
    addShots(shots, 'append');
    appendLog(`已导入 ${shots.length} 镜到故事板`);
  }, [cells, addShots, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-h-80 overflow-y-auto nx9-scroll">
        <div className="flex gap-2">
          <label className="flex-1 text-ink/60">
            行
            <input
              type="number"
              min={1}
              max={6}
              value={rows}
              onChange={(e) => updateNodeData(props.id, { rows: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 mt-0.5"
            />
          </label>
          <label className="flex-1 text-ink/60">
            列
            <input
              type="number"
              min={1}
              max={6}
              value={cols}
              onChange={(e) => updateNodeData(props.id, { cols: Number(e.target.value) })}
              className="w-full rounded border border-line px-1 py-0.5 mt-0.5"
            />
          </label>
        </div>
        {sourceUrl && (
          <img src={sourceUrl} alt="" className="w-full rounded-lg border border-line max-h-20 object-cover" />
        )}
        {splitUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-0.5">
            {splitUrls.slice(0, 9).map((u) => (
              <img key={u} src={u} alt="" className="aspect-square object-cover rounded border border-line" />
            ))}
          </div>
        )}
        {cells.length > 0 && (
          <ul className="space-y-1 border-t border-line pt-2">
            {cells.map((c) => (
              <li key={c.index} className="rounded-lg bg-surface border border-line p-2">
                <button
                  type="button"
                  className="w-full text-left font-medium text-brand"
                  onClick={() => setExpanded(expanded === c.index ? null : c.index)}
                >
                  #{c.index} {c.imagePromptZh.slice(0, 24) || c.imagePrompt.slice(0, 32)}
                </button>
                {expanded === c.index && (
                  <div className="mt-1 space-y-1 text-[10px] font-mono text-ink/70">
                    <p><span className="text-ink/40">首帧:</span> {c.imagePrompt}</p>
                    {c.needsEndFrame && (
                      <p><span className="text-ink/40">尾帧:</span> {c.endFramePrompt}</p>
                    )}
                    <p><span className="text-ink/40">视频:</span> {c.videoPrompt}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => void run()} className="w-full rounded-xl bg-brand text-white py-2">
          Vision 三层反推
        </button>
        {cells.length > 0 && (
          <button
            type="button"
            onClick={importStoryboard}
            className="w-full rounded-xl border border-brand text-brand py-2"
          >
            导入故事板
          </button>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(GridPromptReverseBlock);
