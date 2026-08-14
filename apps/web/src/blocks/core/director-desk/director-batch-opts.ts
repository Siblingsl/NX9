import type { Node, Edge } from '@xyflow/react';
import type { CharacterProfile, EnvironmentProfile } from '@nx9/shared';

interface BatchOptsParams {
  blockId: string;
  skipExisting: boolean;
  skipApproved: boolean;
  concurrency: number;
  maxRetries: number;
  forceCharacterRef: boolean;
  forceSceneRef: boolean;
  styleLock: boolean;
  useGlobalArtDirection?: boolean;
  globalArtDirection?: string;
  episodeArtDirection?: string;
  prefer3dRef: boolean;
  preferLineArtRef: boolean;
  lineArtByShotId: Record<string, string>;
  stylePrompt: string;
  styleSeed: number | null;
  pictureNodeData: Record<string, unknown> | undefined;
  blockData: Record<string, unknown>;
  characters?: CharacterProfile[];
  environments?: EnvironmentProfile[];
  nodes: Node[];
  edges: Edge[];
}

export function buildBatchOpts(params: BatchOptsParams) {
  let enforceComp = false;
  for (const edge of params.edges) {
    if (edge.target !== params.blockId) continue;
    const src = params.nodes.find((n) => n.id === edge.source);
    if (src && (src.data as Record<string, unknown>)?.enforceComposition === true) {
      enforceComp = true;
      break;
    }
  }
  return {
    sourceDirectorDeskId: params.blockId,
    skipExisting: params.skipExisting,
    skipApproved: params.skipApproved,
    concurrency: params.concurrency,
    maxRetries: params.maxRetries,
    forceCharacterRef: params.forceCharacterRef,
    forceSceneRef: params.forceSceneRef,
    styleLock: params.styleLock,
    useGlobalArtDirection: params.useGlobalArtDirection === true,
    globalArtDirection: params.globalArtDirection,
    episodeArtDirection: params.episodeArtDirection,
    prefer3dRef: params.prefer3dRef,
    preferLineArtRef: params.preferLineArtRef,
    lineArtByShotId: params.lineArtByShotId,
    stylePrompt: params.stylePrompt || undefined,
    styleSeed: params.styleSeed != null && Number.isFinite(params.styleSeed) ? params.styleSeed : null,
    pictureNodeData: (params.pictureNodeData ?? {}) as Record<string, unknown>,
    blockData: params.blockData,
    characters: params.characters,
    environments: params.environments,
    enforceComposition: enforceComp,
  };
}

export function buildDirectorBatchLabel(params: {
  filter: string;
  selectedCount: number;
  failedCount: number;
  missingCount: number;
  skipExisting: boolean;
  skipApproved: boolean;
}): string {
  if (params.filter === 'selected') return `批出选中（${params.selectedCount}）`;
  if (params.filter === 'failed') return `重出失败（${params.failedCount}）`;

  const scope = params.filter === 'missing'
    ? `批出未完成（${params.missingCount}）`
    : params.filter === '3donly'
      ? '批出 3D 参考镜头'
      : '批出本集';
  const policy = params.filter === 'missing'
    ? '当前筛选不含已有关键帧'
    : params.skipExisting
      ? '跳过已出'
      : '将重出已有关键帧';
  const approval = params.skipApproved ? '跳过已批准' : '包含已批准';
  return `${scope}（${policy}，${approval}）`;
}
