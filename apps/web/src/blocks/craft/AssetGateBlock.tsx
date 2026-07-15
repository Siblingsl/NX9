import { memo, useCallback, useMemo } from 'react';
import { CheckCircle2, GitBranch, Loader2, MapPin, UserRound } from 'lucide-react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import type { ScriptBreakdownPayload } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { useActivityLog } from '../../stores/activity-log';
import { inspectBreakdownAssets, syncBreakdownAssets } from '../../engine/asset-gate-runner';

function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const { getEdges, getNodes } = useReactFlow();
  return useMemo(() => {
    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const incoming = getEdges().filter((edge) => edge.target === blockId);
    for (const edge of incoming) {
      const payload = (byId.get(edge.source)?.data as Record<string, unknown> | undefined)?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, getEdges, getNodes]);
}

function compactList(items: string[], fallback: string) {
  if (items.length === 0) return fallback;
  return items.slice(0, 3).join('、') + (items.length > 3 ? ` 等 ${items.length} 项` : '');
}

function AssetGateBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const appendLog = useActivityLog((state) => state.append);
  const upstream = useUpstreamBreakdown(props.id);
  const local = props.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
  const payload = upstream ?? local;
  const status = (props.data?.status as string | undefined) ?? 'idle';
  const report = useMemo(() => payload ? inspectBreakdownAssets(payload) : null, [payload]);
  const lastGate = props.data?.assetGate as {
    missingCharacters?: string[];
    missingScenes?: string[];
    syncedCharacters?: number;
    syncedScenes?: number;
    checkedAt?: string;
  } | undefined;

  const runCheck = useCallback(() => {
    if (!payload) {
      updateNodeData(props.id, { status: 'error', error: '请先连接剧本拆分节点' });
      appendLog('设定检查：缺少剧本拆分数据');
      return;
    }
    updateNodeData(props.id, { status: 'running', error: undefined });
    const result = syncBreakdownAssets(props.id, payload);
    updateNodeData(props.id, {
      status: 'success',
      scriptBreakdown: payload,
      assetGate: {
        missingCharacters: result.missingCharacters,
        missingScenes: result.missingScenes,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
        checkedAt: new Date().toISOString(),
      },
      content: `设定检查完成 · 角色 ${result.requiredCharacters.length} / 场景 ${result.requiredScenes.length}`,
      output: payload.episodes.flatMap((episode) => episode.shots.map((shot) => shot.imagePrompt)).join('\n\n'),
      meta: {
        requiredCharacters: result.requiredCharacters.length,
        requiredScenes: result.requiredScenes.length,
        missingCharacters: result.missingCharacters.length,
        missingScenes: result.missingScenes.length,
      },
    });
    appendLog(`设定检查完成 · 新角色 ${result.syncedCharacters} / 新场景 ${result.syncedScenes}`);
  }, [appendLog, payload, props.id, updateNodeData]);

  const missingCharacters = lastGate?.missingCharacters ?? report?.missingCharacters ?? [];
  const missingScenes = lastGate?.missingScenes ?? report?.missingScenes ?? [];
  const passed = Boolean(payload) && missingCharacters.length === 0 && missingScenes.length === 0;

  return (
    <BlockShell {...props}>
      <div className="w-[300px] space-y-2 nodrag nopan text-xs">
        <div className="rounded-xl border border-line/50 bg-white p-2.5">
          <div className="flex items-start gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <GitBranch size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">设定检查</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-ink/45">检查新角色 / 新场景，补齐资产后放行到分镜网格</p>
            </div>
            {status === 'running' ? <Loader2 size={14} className="animate-spin text-brand" /> : passed ? <CheckCircle2 size={15} className="text-ok" /> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line/45 bg-surface/35 p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-ink/55"><UserRound size={11} />角色</div>
            <p className="text-[16px] font-semibold text-ink">{report?.requiredCharacters.length ?? 0}</p>
            <p className={`mt-0.5 text-[9px] ${missingCharacters.length ? 'text-warn' : 'text-ok'}`}>
              {missingCharacters.length ? `新增 ${missingCharacters.length}` : '已齐'}
            </p>
          </div>
          <div className="rounded-xl border border-line/45 bg-surface/35 p-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-ink/55"><MapPin size={11} />场景</div>
            <p className="text-[16px] font-semibold text-ink">{report?.requiredScenes.length ?? 0}</p>
            <p className={`mt-0.5 text-[9px] ${missingScenes.length ? 'text-warn' : 'text-ok'}`}>
              {missingScenes.length ? `新增 ${missingScenes.length}` : '已齐'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line/40 bg-white p-2 text-[10px] leading-relaxed text-ink/55">
          <p><span className="text-ink/35">新角色：</span>{compactList(missingCharacters, '无')}</p>
          <p className="mt-1"><span className="text-ink/35">新场景：</span>{compactList(missingScenes, '无')}</p>
        </div>

        <button
          type="button"
          onClick={runCheck}
          disabled={status === 'running' || !payload}
          className="w-full rounded-lg bg-brand px-3 py-2 text-[12px] font-medium text-white disabled:bg-ink/10 disabled:text-ink/35"
        >
          {payload ? '检查并同步设定' : '等待剧本拆分'}
        </button>
      </div>
    </BlockShell>
  );
}

export default memo(AssetGateBlock);
