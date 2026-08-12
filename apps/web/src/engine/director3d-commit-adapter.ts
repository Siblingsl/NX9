import type { Node } from '@xyflow/react';
import type {
  Director3dCommitPayload,
  Director3dShotState,
} from '@nx9/director3d';
import { quarantineDirector3dShotStates } from '@nx9/director3d';
import type { StoryboardShot } from '@nx9/shared';
import {
  patchUpstreamShot,
  readUpstreamChainStoryboard,
  resolveUpstreamChainDesk,
} from './chain-storyboard-utils';

export interface Director3dCommitAdapterOptions {
  /** 保存 3D 草稿的节点；旧调用同时把它作为 chain 解析起点。 */
  blockId: string;
  /** chain 解析起点；外部 3D 节点嵌入导演台时应为导演台节点。 */
  sourceBlockId?: string;
  /** 写入 director3dGuide.sourceBlockId 的真实 3D 存储节点。 */
  guideSourceBlockId?: string;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  getLatestNodes?: () => Node[];
  currentSourceShotRevision?: number;
  /** 节点已消费的 commitId；命中则幂等成功且不再写 chain。 */
  consumedCommitIds?: string[];
  /** 内嵌模式用此回调写入 director3d 命名空间。 */
  persistCommit?: (payload: Director3dCommitPayload) => void;
  onCommitted?: (payload: Director3dCommitPayload) => void;
}

export interface Director3dCommitResult {
  ok: boolean;
  idempotent?: boolean;
  error?: string;
}

function isPersistentImageUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  if (!value) return false;
  if (value.startsWith('data:')) return false;
  return true;
}

function guideFromCommit(
  payload: Director3dCommitPayload,
  sourceBlockId: string,
): NonNullable<StoryboardShot['director3dGuide']> {
  const { candidate, sceneState } = payload;
  return {
    sourceBlockId,
    captureId: candidate.id,
    captureUrl: candidate.imageUrl ?? '',
    commitId: payload.commitId,
    shotId: payload.shotId,
    episodeId: payload.episodeId,
    sourceShotRevision: payload.sourceShotRevision,
    cameraPrompt: candidate.prompt,
    cameraPosition: candidate.camera.position,
    cameraRotation: candidate.camera.rotation,
    cameraFov: candidate.camera.fov,
    panoramaUrl: sceneState.environment.panoramaUrl,
    characterPlacements: candidate.characterPlacements.map((placement) => ({
      ...placement,
      objectId: placement.objectId ?? `shot-character-${placement.characterId ?? placement.name}`,
      scale: placement.scale ?? [1, 1, 1],
    })),
    appliedAt: payload.committedAt,
  };
}

export function createDirector3dCommitAdapter(options: Director3dCommitAdapterOptions) {
  return (payload: Director3dCommitPayload): Director3dCommitResult => {
    if (payload.version !== 1) return { ok: false, error: '不支持的 3D 提交版本' };
    if (!payload.shotId || payload.candidate.shotId !== payload.shotId) {
      return { ok: false, error: '提交镜头上下文不一致' };
    }
    if (payload.sceneState.shotId !== payload.shotId) {
      return { ok: false, error: '提交场景不是当前镜头状态' };
    }
    if (payload.candidate.status === 'failed') {
      return { ok: false, error: '候选帧上传失败，请重试后再提交' };
    }
    if (payload.candidate.status !== 'ready' && payload.candidate.status !== 'committed') {
      return { ok: false, error: '候选帧尚未完成上传' };
    }
    if (!isPersistentImageUrl(payload.candidate.imageUrl)) {
      return { ok: false, error: '采用帧缺少持久化图片，禁止提交本地草稿' };
    }

    const nodes = options.getLatestNodes?.() ?? options.nodes;
    const sourceBlockId = options.sourceBlockId ?? options.blockId;
    const upstreamDeskId = resolveUpstreamChainDesk(sourceBlockId, nodes, options.edges);
    const chain = readUpstreamChainStoryboard(sourceBlockId, nodes, options.edges);
    if (!upstreamDeskId || !chain) return { ok: false, error: '未连接上游分镜台链镜表，不能提交' };
    const shot = chain.shots.find((item) => item.id === payload.shotId);
    if (!shot) return { ok: false, error: '当前镜头不属于上游链镜表' };

    const liveSourceRevision =
      options.currentSourceShotRevision ?? shot.sourceRevision;
    if (
      liveSourceRevision !== undefined &&
      payload.sourceShotRevision !== liveSourceRevision
    ) {
      return { ok: false, error: '上游镜头版本已变化，请重新载入当前镜头' };
    }

    if (
      shot.director3dGuide?.commitId === payload.commitId
      || options.consumedCommitIds?.includes(payload.commitId)
    ) {
      return { ok: true, idempotent: true };
    }

    const patch: Partial<StoryboardShot> = {
      director3dGuide: guideFromCommit(
        payload,
        options.guideSourceBlockId ?? payload.blockId ?? options.blockId,
      ),
    };
    const patched = patchUpstreamShot(
      options.updateNodeData,
      sourceBlockId,
      nodes,
      options.edges,
      payload.shotId,
      patch,
      options.getLatestNodes,
    );
    if (!patched) return { ok: false, error: '上游链镜表写回失败' };

    if (options.persistCommit) {
      options.persistCommit(payload);
    } else {
      options.updateNodeData(options.blockId, {
        sceneByShot: {
          ...((nodes.find((node) => node.id === options.blockId)?.data as Record<string, unknown> | undefined)
            ?.sceneByShot as Record<string, unknown> | undefined),
          [payload.shotId]: payload.sceneState,
        },
        last3dCommit: payload,
        last3dCommitMessage: '3D 构图已提交，可进入彩色关键帧批出',
      });
    }
    options.onCommitted?.(payload);
    return { ok: true };
  };
}

export function sceneByShotFromNodeData(data: Record<string, unknown>): Record<string, Director3dShotState> {
  const raw = data.sceneByShot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return quarantineDirector3dShotStates(raw as Record<string, Director3dShotState>).states;
}
