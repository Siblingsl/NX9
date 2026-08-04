import type { Node } from '@xyflow/react';
import type {
  Director3dCommitPayload,
  Director3dShotState,
} from '@nx9/director3d';
import type { StoryboardShot } from '@nx9/shared';
import {
  patchUpstreamShot,
  readUpstreamChainStoryboard,
  resolveUpstreamChainDesk,
} from './chain-storyboard-utils';

export interface Director3dCommitAdapterOptions {
  blockId: string;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  currentSourceShotRevision?: number;
  onCommitted?: (payload: Director3dCommitPayload) => void;
}

export interface Director3dCommitResult {
  ok: boolean;
  idempotent?: boolean;
  error?: string;
}

function guideFromCommit(payload: Director3dCommitPayload): NonNullable<StoryboardShot['director3dGuide']> {
  const { candidate, sceneState } = payload;
  return {
    sourceBlockId: payload.blockId ?? 'director-3d',
    captureId: candidate.id,
    captureUrl: candidate.imageUrl ?? candidate.localDataUrl ?? '',
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
    if (!payload.candidate.imageUrl && !payload.candidate.localDataUrl) {
      return { ok: false, error: '采用帧没有可用图片' };
    }
    if (payload.candidate.status !== 'ready' && payload.candidate.status !== 'committed') {
      return { ok: false, error: '候选帧尚未完成上传' };
    }

    const upstreamDeskId = resolveUpstreamChainDesk(options.blockId, options.nodes, options.edges);
    const chain = readUpstreamChainStoryboard(options.blockId, options.nodes, options.edges);
    if (!upstreamDeskId || !chain) return { ok: false, error: '未连接上游分镜台链镜表，不能提交' };
    const shot = chain.shots.find((item) => item.id === payload.shotId);
    if (!shot) return { ok: false, error: '当前镜头不属于上游链镜表' };

    if (
      options.currentSourceShotRevision !== undefined &&
      payload.sourceShotRevision !== options.currentSourceShotRevision
    ) {
      return { ok: false, error: '上游镜头版本已变化，请重新载入当前镜头' };
    }

    if (shot.director3dGuide?.commitId === payload.commitId) {
      return { ok: true, idempotent: true };
    }

    const patch: Partial<StoryboardShot> = { director3dGuide: guideFromCommit(payload) };
    const patched = patchUpstreamShot(
      options.updateNodeData,
      options.blockId,
      options.nodes,
      options.edges,
      payload.shotId,
      patch,
    );
    if (!patched) return { ok: false, error: '上游链镜表写回失败' };

    options.updateNodeData(options.blockId, {
      sceneByShot: {
        ...((options.nodes.find((node) => node.id === options.blockId)?.data as Record<string, unknown> | undefined)
          ?.sceneByShot as Record<string, unknown> | undefined),
        [payload.shotId]: payload.sceneState,
      },
      last3dCommit: payload,
      last3dCommitMessage: '3D 构图已提交，可进入彩色关键帧批出',
    });
    options.onCommitted?.(payload);
    return { ok: true };
  };
}

export function sceneByShotFromNodeData(data: Record<string, unknown>): Record<string, Director3dShotState> {
  const raw = data.sceneByShot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, Director3dShotState>;
}
