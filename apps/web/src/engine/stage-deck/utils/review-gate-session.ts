import {
  activeEpisodeShots,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useFlowRuntime, useStoryboardUi } from '../../../stores/flow-runtime';
import { useViewMode } from '../stores/view-mode';
import { getAllChainShots } from '../../chain-storyboard-aggregate';

export type OpenReviewGateOptions = {
  /** 镜头 index 列表（与审阅关卡 pendingShots 一致） */
  pendingIndices?: number[];
  /** 镜头 id 列表（会解析为 index） */
  pendingShotIds?: string[];
  /** 关键帧 / 成片 */
  stage?: 'keyframe' | 'video';
  /** banner 文案来源 */
  source?: 'director-desk' | 'clip-gen' | 'cascade';
};

function resolveReviewShots() {
  const nodes = useFlowRuntime.getState().runtime?.getNodes() ?? [];
  const chain = getAllChainShots(nodes);
  if (chain.length > 0) return chain;
  // 无链数据时仅作迁移兼容读全局
  return getAllChainShots(nodes, { allowGlobalFallback: true });
}

/** 收集当前集「有图且未 approved」的关键帧待审 index */
export function collectPendingKeyframeIndices(): number[] {
  const nodes = useFlowRuntime.getState().runtime?.getNodes() ?? [];
  const chain = getAllChainShots(nodes);
  const shots =
    chain.length > 0
      ? chain
      : activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
  const activeEp = useWorkspaceDocument.getState().storyboard.activeEpisodeId;
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
  const shots = resolveReviewShots();

  if (opts.pendingShotIds?.length) {
    const byId = new Map(shots.map((s) => [s.id, s]));
    for (const id of opts.pendingShotIds) {
      const s = byId.get(id);
      if (s && !pendingIndices.includes(s.index)) pendingIndices.push(s.index);
    }
  }

  if (!pendingIndices.length && opts.stage !== 'video') {
    pendingIndices = collectPendingKeyframeIndices();
  }

  useViewMode.getState().setMode('review');
  const runtime = useFlowRuntime.getState().runtime;
  const director = runtime?.getNodes().find((n) => n.type === 'director-desk');
  if (director) runtime?.focusBlock(director.id);

  if (!pendingIndices.length) return pendingIndices;

  const first = shots.find((s) => pendingIndices.includes(s.index));
  if (first) {
    useStoryboardUi.getState().selectShot(first.id);
  }

  return pendingIndices;
}
