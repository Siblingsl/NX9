import { memo, useCallback, useMemo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { shotsToClipChain, emptyClipChain, buildContinuationPrompt } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';
import { runClipChain } from '../../engine/clip-chain-runner';

function SeedanceChainBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const storyboardTitle = useWorkspaceDocument((s) => s.storyboard.title);

  const chain = (props.data?.clipChain as ReturnType<typeof emptyClipChain>) ?? emptyClipChain();
  const status = props.data?.status as string | undefined;
  const projectGoal = (props.data?.projectGoal as string) ?? storyboardTitle ?? '';

  const targetShots = useMemo(
    () => shots.filter((s) => s.videoPromptEn).sort((a, b) => a.index - b.index),
    [shots],
  );

  const loadChain = useCallback(() => {
    if (targetShots.length === 0) { appendLog('故事板无可用镜头'); return; }
    const next = shotsToClipChain(targetShots, projectGoal);
    updateNodeData(props.id, { clipChain: next, projectGoal });
    appendLog(`已加载 ${next.items.length} 段连续 Clip`);
  }, [targetShots, projectGoal, props.id, updateNodeData, appendLog]);

  const runChain = useCallback(async () => {
    if (chain.items.length === 0) { loadChain(); return; }
    updateNodeData(props.id, { status: 'running' });
    appendLog('Seedance Chain 开始…');
    await runClipChain(
      chain,
      projectGoal,
      (next) => updateNodeData(props.id, { clipChain: next }),
      (item, url) => {
        if (item.shotId) updateShot(item.shotId, { videoAssetId: url, status: 'review' });
      },
      (msg) => appendLog(msg),
    );
    updateNodeData(props.id, { status: 'success' });
    appendLog('Seedance Chain 执行完毕');
  }, [chain, projectGoal, props.id, updateNodeData, updateShot, loadChain, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs max-w-[300px]">
        <p className="text-[10px] text-ink/50">
          {targetShots.length} 个可用镜头 · {chain.items.length} 段已加载
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={loadChain} className="flex-1 rounded-lg border border-line py-1.5">
            加载镜头链
          </button>
          <button
            type="button"
            onClick={() => void runChain()}
            disabled={status === 'running'}
            className="flex-1 rounded-lg bg-brand text-white py-1.5 disabled:opacity-50"
          >
            {status === 'running' ? '生成中…' : '连续生成'}
          </button>
        </div>
        {chain.items.length > 0 && (
          <ul className="max-h-32 overflow-y-auto space-y-1 border border-line rounded-lg p-1">
            {chain.items.map((item, i) => (
              <li key={item.index} className="flex items-center gap-1 text-[10px]">
                <span className="font-mono text-brand w-12">{item.label}</span>
                <span className="flex-1 truncate text-ink/70">{item.prompt}</span>
                <span className={`shrink-0 px-1 rounded ${
                  item.status === 'done' ? 'bg-ok/15 text-ok' :
                  item.status === 'running' ? 'bg-warn/15 text-warn' :
                  item.status === 'failed' ? 'bg-red-100 text-red-600' :
                  'bg-ink/10 text-ink/50'
                }`}>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(SeedanceChainBlock);
