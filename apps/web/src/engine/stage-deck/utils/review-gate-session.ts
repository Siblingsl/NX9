import {
  type StoryboardShot,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime, useStoryboardUi } from '../../../stores/flow-runtime';
import { useViewMode } from '../stores/view-mode';
import { findDeskIdForShot, getAllChainShots } from '../../chain-storyboard-aggregate';
import { resolveDownstreamDirectorDeskId } from '../../chain-storyboard-utils';

export type OpenReviewGateOptions = {
  /** 镜头 index 列表（与审阅关卡 pendingShots 一致） */
  pendingIndices?: number[];
  /** 镜头 id 列表（会解析为 index） */
  pendingShotIds?: string[];
  /** 关键帧 / 成片 */
  stage?: 'keyframe' | 'video';
  /** banner 文案来源 */
  source?: 'director-desk' | 'clip-gen' | 'cascade';
  /** DD-P1-03：显式作用域，禁止回猜全局 active episode */
  episodeId?: string;
  sourceChainDeskId?: string;
  shots?: StoryboardShot[];
};

function resolveReviewShots(opts?: Pick<OpenReviewGateOptions, 'shots' | 'episodeId'>) {
  if (opts?.shots?.length) {
    const ep = opts.episodeId;
    return ep
      ? opts.shots.filter((s) => s.episodeId === ep || !s.episodeId)
      : opts.shots;
  }
  const nodes = useFlowRuntime.getState().runtime?.getNodes() ?? [];
  const chain = getAllChainShots(nodes);
  if (chain.length > 0) {
    const ep = opts?.episodeId ?? useWorkspaceDocument.getState().storyboard.activeEpisodeId;
    return ep
      ? chain.filter((s) => s.episodeId === ep || !s.episodeId)
      : chain;
  }
  // DD-R-01：无链镜表时不回退全局 storyboard，避免误审旧档全局镜头
  return [];
}

/** 收集当前集「有图且未 approved」的关键帧待审 index */
export function collectPendingKeyframeIndices(
  opts?: Pick<OpenReviewGateOptions, 'shots' | 'episodeId'>,
): number[] {
  const shots = resolveReviewShots(opts);
  const activeEp =
    opts?.episodeId
    ?? (opts?.shots?.length
      ? undefined
      : useWorkspaceDocument.getState().storyboard.activeEpisodeId);
  const scoped = activeEp
    ? shots.filter((s) => s.episodeId === activeEp || !s.episodeId)
    : shots;
  return scoped
    .filter(
      (s) =>
        Boolean(s.firstFrameAssetId) &&
        s.keyframeStatus !== 'approved' &&
        s.status !== 'approved' &&
        s.keyframeStatus !== 'failed' &&
        s.status !== 'failed',
    )
    .map((s) => s.index)
    .sort((a, b) => a - b);
}

/** 导演台批出后 / Cascade 门禁：切审片模式 + 故事板网格 + 定位首个待审镜头 */
export function openReviewGateSession(
  pendingIndicesOrOpts?: number[] | OpenReviewGateOptions,
) {
  const opts: OpenReviewGateOptions = Array.isArray(pendingIndicesOrOpts)
    ? { pendingIndices: pendingIndicesOrOpts }
    : pendingIndicesOrOpts ?? {};

  let pendingIndices = opts.pendingIndices ? [...opts.pendingIndices] : [];
  const shots = resolveReviewShots(opts);

  if (opts.pendingShotIds?.length) {
    const byId = new Map(shots.map((s) => [s.id, s]));
    for (const id of opts.pendingShotIds) {
      const s = byId.get(id);
      if (s && !pendingIndices.includes(s.index)) pendingIndices.push(s.index);
    }
  }

  if (!pendingIndices.length && opts.stage !== 'video') {
    pendingIndices = collectPendingKeyframeIndices(opts);
  }

  useViewMode.getState().setMode('review');
  const runtime = useFlowRuntime.getState().runtime;
  const nodes = runtime?.getNodes() ?? [];
  const edges = runtime?.getEdges() ?? [];
  // SB-D-10: 多链下只聚焦「待审镜头所属链」的下游导演台；无链/无出边时不猜第一个
  let sourceChainDeskId = opts.sourceChainDeskId;
  if (!sourceChainDeskId) {
    const firstPending = shots.find((s) => pendingIndices.includes(s.index))
      ?? shots.find((s) => opts.pendingShotIds?.includes(s.id));
    if (firstPending) sourceChainDeskId = findDeskIdForShot(firstPending.id, nodes) ?? undefined;
  }
  const directorId = sourceChainDeskId
    ? resolveDownstreamDirectorDeskId(sourceChainDeskId, nodes as any, edges as any)
    : undefined;
  const director = directorId ? nodes.find((n) => n.id === directorId) : undefined;
  if (director) runtime?.focusBlock(director.id);

  if (!pendingIndices.length) return pendingIndices;

  const first = shots.find((s) => pendingIndices.includes(s.index));
  if (first) {
    useStoryboardUi.getState().selectShot(first.id);
  }

  return pendingIndices;
}
