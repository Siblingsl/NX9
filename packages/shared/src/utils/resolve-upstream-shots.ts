/**
 * F-003/F-004: 按入边解析上游镜头（纯函数）。
 * 仅消费 storyboard-desk.chainStoryboard；禁止回退全局镜表。
 */
import type { StoryboardShot } from '../types/storyboard';
import { readChainStoryboard } from './chain-storyboard';

export type UpstreamShotNode = {
  id: string;
  type?: string | null;
  data?: Record<string, unknown>;
};

export type UpstreamShotEdge = {
  source: string;
  target: string;
};

export type ResolveUpstreamShotsResult = {
  hasUpstream: boolean;
  shots: StoryboardShot[];
  shotIds: string[];
};

function shotsFromDeskData(data: Record<string, unknown> | undefined): StoryboardShot[] {
  const chain = readChainStoryboard(data ?? {});
  return chain?.shots ?? [];
}

/** 从图中所有 storyboard-desk 建 shotId → shot 索引 */
function indexChainShots(nodes: UpstreamShotNode[]): Map<string, StoryboardShot> {
  const byId = new Map<string, StoryboardShot>();
  for (const node of nodes) {
    if (node.type !== 'storyboard-desk') continue;
    for (const shot of shotsFromDeskData(node.data)) {
      if (!byId.has(shot.id)) byId.set(shot.id, shot);
    }
  }
  return byId;
}

/**
 * 解析 block 的上游镜头。
 * - 无入边 → 空（F-004 无上游不误批）
 * - 入边连 storyboard-desk → 仅该 desk 的 chainStoryboard
 * - 入边连 director-desk → 用 linkedShotIds 在链索引中解析，或再向上游 desk
 */
export function resolveUpstreamShotsFromGraph(
  blockId: string,
  nodes: UpstreamShotNode[],
  edges: UpstreamShotEdge[],
): ResolveUpstreamShotsResult {
  const incoming = edges.filter(
    (edge) => edge.target === blockId && nodes.some((node) => node.id === edge.source),
  );
  if (incoming.length === 0) {
    return { hasUpstream: false, shots: [], shotIds: [] };
  }

  const byId = indexChainShots(nodes);
  const collected = new Map<string, StoryboardShot>();

  for (const edge of incoming) {
    const source = nodes.find((n) => n.id === edge.source);
    if (!source) continue;

    if (source.type === 'storyboard-desk') {
      for (const shot of shotsFromDeskData(source.data)) {
        collected.set(shot.id, shot);
      }
      continue;
    }

    if (source.type === 'director-desk') {
      const linked = (source.data?.linkedShotIds as string[] | undefined) ?? [];
      for (const id of linked) {
        const shot = byId.get(id);
        if (shot) collected.set(shot.id, shot);
      }
      if (linked.length === 0) {
        const deskEdges = edges.filter((e) => e.target === source.id);
        for (const de of deskEdges) {
          const desk = nodes.find((n) => n.id === de.source && n.type === 'storyboard-desk');
          if (!desk) continue;
          for (const shot of shotsFromDeskData(desk.data)) {
            collected.set(shot.id, shot);
          }
        }
      }
    }
  }

  const shots = [...collected.values()].sort((a, b) => a.index - b.index);
  return {
    hasUpstream: true,
    shots,
    shotIds: shots.map((s) => s.id),
  };
}
