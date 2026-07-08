import { memo, useCallback, useState } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import {
  buildContinuationPrompt,
  emptyClipChain,
  shotsToClipChain,
  type ClipChainItem,
  type ClipChainState,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';
import { runClipChain } from '../../engine/clip-chain-runner';

function MotionStoryBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((s) => s.append);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const storyboardTitle = useWorkspaceDocument((s) => s.storyboard.title);

  const chain = (props.data?.clipChain as ClipChainState) ?? emptyClipChain();
  const status = props.data?.status as string | undefined;
  const [projectGoal, setProjectGoal] = useState(
    (props.data?.projectGoal as string) ?? storyboardTitle ?? '',
  );

  const syncChain = useCallback(
    (next: ClipChainState) => {
      updateNodeData(props.id, { clipChain: next, projectGoal });
    },
    [props.id, projectGoal, updateNodeData],
  );

  const loadFromStoryboard = useCallback(() => {
    if (shots.length === 0) {
      appendLog('故事板无镜头，无法构建 Clip 链');
      return;
    }
    const next = shotsToClipChain(shots, projectGoal);
    syncChain(next);
    appendLog(`已加载 ${next.items.length} 段连续 Clip 链`);
  }, [shots, projectGoal, syncChain, appendLog]);

  const runChain = useCallback(async () => {
    if (chain.items.length === 0) {
      loadFromStoryboard();
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    appendLog('Seedance 连续 Clip 链开始…');

    await runClipChain(
      chain,
      projectGoal,
      (next) => syncChain(next),
      (item, url) => {
        if (item.shotId) {
          updateShot(item.shotId, { videoAssetId: url, status: 'review' });
        }
      },
      (msg) => appendLog(msg),
    );

    updateNodeData(props.id, { status: 'success' });
    appendLog('连续 Clip 链执行完毕');
  }, [chain, projectGoal, props.id, updateNodeData, syncChain, updateShot, loadFromStoryboard, appendLog]);

  const runSingle = useCallback(
    async (idx: number) => {
      const item = chain.items[idx];
      if (!item) return;
      const prior = chain.items.slice(0, idx);
      const prompt = buildContinuationPrompt(item, prior, projectGoal);
      updateNodeData(props.id, { status: 'running' });
      try {
        const res = await api.proxyVideo({
          prompt,
          model: 'seedance',
          imageUrl: prior[prior.length - 1]?.videoUrl,
        });
        const nextItems = chain.items.map((it, i) =>
          i === idx
            ? {
                ...it,
                status: res.url ? ('done' as const) : ('failed' as const),
                videoUrl: res.url,
                previousSummary: prompt.slice(0, 200),
              }
            : it,
        );
        syncChain({ ...chain, items: nextItems, currentIndex: idx + 1 });
        if (item.shotId && res.url) {
          updateShot(item.shotId, { videoAssetId: res.url, status: 'review' });
        }
        appendLog(`${item.label} 完成`);
      } catch (e) {
        appendLog(`${item.label} 失败: ${String(e)}`);
      } finally {
        updateNodeData(props.id, { status: 'idle' });
      }
    },
    [chain, projectGoal, props.id, updateNodeData, syncChain, updateShot, appendLog],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-xs">
        <input
          value={projectGoal}
          onChange={(e) => {
            setProjectGoal(e.target.value);
            updateNodeData(props.id, { projectGoal: e.target.value });
          }}
          placeholder="项目目标（连续剧情终点）"
          className="w-full rounded-lg border border-line px-2 py-1.5"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={loadFromStoryboard}
            className="flex-1 rounded-lg border border-line py-1.5 hover:border-brand/40"
          >
            从故事板加载
          </button>
          <button
            type="button"
            onClick={() => void runChain()}
            disabled={status === 'running'}
            className="flex-1 rounded-lg bg-brand text-white py-1.5 disabled:opacity-50"
          >
            {status === 'running' ? '链式生成中…' : '一键连续生成'}
          </button>
        </div>
        {chain.items.length > 0 && (
          <ul className="max-h-40 overflow-y-auto space-y-1 border border-line rounded-lg p-1">
            {chain.items.map((item: ClipChainItem, i: number) => (
              <li
                key={item.index}
                className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-surface"
              >
                <span className="font-mono text-brand shrink-0 w-12">{item.label}</span>
                <span className="flex-1 truncate text-ink/70">{item.prompt || '—'}</span>
                <span
                  className={`shrink-0 text-[10px] px-1 rounded ${
                    item.status === 'done'
                      ? 'bg-ok/15 text-ok'
                      : item.status === 'failed'
                        ? 'bg-red-100 text-red-600'
                        : item.status === 'running'
                          ? 'bg-warn/15 text-warn'
                          : 'bg-ink/10 text-ink/50'
                  }`}
                >
                  {item.status}
                </span>
                {item.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void runSingle(i)}
                    className="text-[10px] text-brand shrink-0"
                  >
                    跑
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(MotionStoryBlock);
