import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  bridgePromptSuffix,
  buildContinuationPrompt,
  emptyClipChain,
  groupSClassShots,
  shotsToClipChain,
  validateSClassReferences,
  SCLASS_MAX_REF_IMAGES,
  SCLASS_MAX_REF_VIDEOS,
  type ClipChainItem,
  type ClipChainState,
  type SClassGroup,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';
import { runClipChain } from '../../engine/clip-chain-runner';

function parseList(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function MotionStoryBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
  const appendLog = useActivityLog((s) => s.append);
  const allShots = useWorkspaceDocument((s) => s.storyboard.shots);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const storyboardTitle = useWorkspaceDocument((s) => s.storyboard.title);
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const linkedShot = linkedShotId ? allShots.find((s) => s.id === linkedShotId) : undefined;
  const scopeShots = props.data?.scopeShots as string[] | undefined;
  const shots = linkedShot ? [linkedShot] : scopeShots ? allShots.filter((s) => scopeShots.includes(s.id)) : allShots;

  const bridgeSuffix = useMemo(() => {
    const bridgeRefs: string[] = [];
    const incomingEdges = edges.filter((e) => e.target === props.id);
    for (const e of incomingEdges) {
      const up = nodes.find((n) => n.id === e.source);
      const refs = (up?.data?.bridgeRefs as string[] | undefined);
      if (refs) bridgeRefs.push(...refs);
    }
    return bridgeRefs.length ? bridgePromptSuffix(bridgeRefs.map((id) => ({ bridgePreset: 'dissolve', durationSec: 0.5, refImageIds: [id] }))) : '';
  }, [edges, nodes, props.id]);

  const chain = (props.data?.clipChain as ClipChainState) ?? emptyClipChain();
  const status = props.data?.status as string | undefined;
  const [projectGoal, setProjectGoal] = useState(
    (props.data?.projectGoal as string) ?? linkedShot?.videoPromptEn ?? linkedShot?.promptEn ?? linkedShot?.descriptionZh ?? storyboardTitle ?? '',
  );

  const refImagesText = (props.data?.sclassImagesText as string) ?? '';
  const refVideosText = (props.data?.sclassVideosText as string) ?? '';
  const sclassGroups = (props.data?.sclassGroups as SClassGroup[] | undefined) ?? [];

  const refImages = parseList(refImagesText);
  const refVideos = parseList(refVideosText);
  const constraintError = validateSClassReferences(refImages.length, refVideos.length);

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
    const goalWithBridge = bridgeSuffix ? `${projectGoal}\n${bridgeSuffix}` : projectGoal;
    const next = shotsToClipChain(shots, goalWithBridge);
    syncChain(next);
    appendLog(`已加载 ${next.items.length} 段连续 Clip 链`);
  }, [shots, projectGoal, bridgeSuffix, syncChain, appendLog]);

  const previewSClassGroups = useCallback(() => {
    if (shots.length === 0) {
      appendLog('故事板无镜头，无法分组');
      return;
    }
    const groups = groupSClassShots(shots);
    updateNodeData(props.id, { sclassGroups: groups });
    appendLog(`S-Class 分组：${groups.length} 组（≤15s/组）`);
  }, [shots, props.id, updateNodeData, appendLog]);

  const runChain = useCallback(async () => {
    if (constraintError) {
      appendLog(`S-Class 约束未通过：${constraintError}`);
      return;
    }
    if (chain.items.length === 0) {
      loadFromStoryboard();
      return;
    }
    updateNodeData(props.id, { status: 'running' });
    appendLog('Seedance 连续 Clip 链开始…');

    const goalWithBridge = bridgeSuffix ? `${projectGoal}\n${bridgeSuffix}` : projectGoal;

    await runClipChain(
      chain,
      goalWithBridge,
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
  }, [chain, projectGoal, bridgeSuffix, props.id, updateNodeData, syncChain, updateShot, loadFromStoryboard, appendLog, constraintError]);

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
        {linkedShot && (
          <p className="text-[10px] text-brand/70">
            已绑定镜头 #{linkedShot.index} · {linkedShot.durationSec}s · {linkedShot.shotType}
          </p>
        )}
        {bridgeSuffix && (
          <p className="text-[10px] text-accent/70">已绑定桥接镜头 · {bridgeSuffix}</p>
        )}
        <input
          value={projectGoal}
          onChange={(e) => {
            setProjectGoal(e.target.value);
            updateNodeData(props.id, { projectGoal: e.target.value });
          }}
          placeholder="项目目标（连续剧情终点）"
          className="w-full rounded-lg border border-line px-2 py-1.5"
        />
        <div className="grid grid-cols-2 gap-1">
          <label className="text-[10px] text-ink/50">
            参考图（≤{SCLASS_MAX_REF_IMAGES}）
            <textarea
              value={refImagesText}
              onChange={(e) => updateNodeData(props.id, { sclassImagesText: e.target.value })}
              placeholder="每行一个 URL"
              rows={2}
              className="w-full mt-0.5 rounded border border-line px-1 py-0.5 resize-y"
            />
          </label>
          <label className="text-[10px] text-ink/50">
            参考视频（≤{SCLASS_MAX_REF_VIDEOS}）
            <textarea
              value={refVideosText}
              onChange={(e) => updateNodeData(props.id, { sclassVideosText: e.target.value })}
              placeholder="每行一个 URL"
              rows={2}
              className="w-full mt-0.5 rounded border border-line px-1 py-0.5 resize-y"
            />
          </label>
        </div>
        {constraintError && (
          <p className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5">{constraintError}</p>
        )}
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
            onClick={previewSClassGroups}
            className="flex-1 rounded-lg border border-line py-1.5 hover:border-brand/40"
          >
            S-Class 分组
          </button>
        </div>
        <button
          type="button"
          onClick={() => void runChain()}
          disabled={status === 'running' || Boolean(constraintError)}
          className="w-full rounded-lg bg-brand text-white py-1.5 disabled:opacity-50"
        >
          {status === 'running' ? '链式生成中…' : '一键连续生成'}
        </button>
        {sclassGroups.length > 0 && (
          <ul className="max-h-32 overflow-y-auto space-y-1 border border-line rounded-lg p-1">
            {sclassGroups.map((g, gi) => (
              <li key={g.id} className="flex items-center gap-1 px-1 py-0.5 rounded">
                <span className="font-mono text-brand shrink-0 w-16">{g.name}</span>
                <span className="flex-1 truncate text-ink/70">
                  {g.shotIds.length} 镜 · {g.totalDurationSec}s
                </span>
                {g.overLimit && (
                  <span className="shrink-0 text-[10px] px-1 rounded bg-red-100 text-red-600">超 15s</span>
                )}
                <span className="shrink-0 text-[10px] text-ink/40">#{gi + 1}</span>
              </li>
            ))}
          </ul>
        )}
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
