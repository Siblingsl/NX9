import { useState } from 'react';
import { useFlowCommands } from '../../../stores/flow-commands';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime } from '../../../stores/flow-runtime';
import { useActivityLog } from '../../../stores/activity-log';

interface GridGeneratePanelProps {
  selectedBlockId: string | null;
}

/** P2-05: 宫格切分 → 分配到分镜镜头 */
export function GridGeneratePanel({ selectedBlockId }: GridGeneratePanelProps) {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const requestSpawn = useFlowCommands((s) => s.requestSpawn);
  const runtime = useFlowRuntime((s) => s.runtime);
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const appendLog = useActivityLog((s) => s.append);

  const node = selectedBlockId
    ? runtime?.getNodes().find((n) => n.id === selectedBlockId)
    : undefined;
  const splitUrls = (node?.data?.splitUrls as string[]) ?? [];
  const isGridSplit = node?.type === 'grid-split';

  const spawnGridChain = () => {
    requestSpawn('grid-split');
    appendLog(`已请求添加宫格切分模块（${rows}×${cols}）`);
    if (selectedBlockId && runtime) {
      runtime.updateNodeData(selectedBlockId, {
        gridRows: rows,
        gridCols: cols,
      });
    }
  };

  const assignToShots = () => {
    if (splitUrls.length === 0) {
      appendLog('当前模块无切分图，请先运行宫格切分');
      return;
    }
    const shots = [...storyboard.shots].sort((a, b) => a.index - b.index);
    let assigned = 0;
    splitUrls.forEach((url, i) => {
      const shot = shots[i];
      if (!shot) return;
      updateShot(shot.id, {
        firstFrameAssetId: url,
        status: 'review',
      });
      assigned++;
    });
    appendLog(`已将 ${assigned} 张切分图分配到分镜（待审阅）`);
  };

  return (
    <div className="space-y-3 text-xs">
      <p className="text-ink/50 leading-relaxed">
        宫格流程：生成/contact-sheet → <strong>grid-split</strong> 切分 → 绑定分镜镜头。
      </p>
      <div className="flex gap-2">
        <label className="flex-1">
          行
          <input
            type="number"
            min={1}
            max={6}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value) || 2)}
            className="w-full mt-1 rounded-lg border border-line px-2 py-1"
          />
        </label>
        <label className="flex-1">
          列
          <input
            type="number"
            min={1}
            max={6}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value) || 2)}
            className="w-full mt-1 rounded-lg border border-line px-2 py-1"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={spawnGridChain}
        className="w-full rounded-xl border border-line py-2 hover:border-brand/40"
      >
        添加宫格切分模块
      </button>
      {isGridSplit && splitUrls.length > 0 && (
        <button
          type="button"
          onClick={assignToShots}
          className="w-full rounded-xl bg-brand text-white py-2 hover:bg-brand/90"
        >
          分配 {splitUrls.length} 张到分镜
        </button>
      )}
      {isGridSplit && splitUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {splitUrls.slice(0, 9).map((url, i) => (
            <img key={url} src={url} alt="" className="rounded border border-line aspect-square object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}
