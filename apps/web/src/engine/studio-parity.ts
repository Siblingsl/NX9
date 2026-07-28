/**
 * studio-parity.ts — 制作台与画布功能对等门面（F-002 / F-028）。
 *
 * 制作台所有写操作通过此门面走与画布相同的 runner/store API。
 * 同契约、同数据、同结果；共用引擎；禁止残血化。
 * 剧本编辑读 script-desk data.package；镜表走 chainStoryboard。
 */
import type { Node, Edge } from '@xyflow/react';
import {
  readChainStoryboard,
  buildChainStoryboardPayload,
  patchChainShot as patchChainShotShared,
  screenplayFullText,
  type ChainStoryboardPayload,
  type StoryboardShot,
  type EpisodeMeta,
  type EpisodeExportRecord,
  type ScreenplayPackage,
  type ScriptPlanPayload,
} from '@nx9/shared';

export interface StudioBinding {
  workspaceId: string;
  /** storyboard-desk 节点 id（作为链镜表 SSOT） */
  chainRootNodeId: string;
  /** 来源标识 */
  source: 'canvas' | 'production-studio';
  /** 绑定的编剧台节点 id（用于剧本读取） */
  scriptDeskId?: string;
}

/**
 * 解析制作台/画布的工作区绑定。
 * 优先使用 lastFocusedStoryboardDeskId，否则取画布上第一个 storyboard-desk，
 * 再无则返回 null。
 */
export function resolveStudioBinding(
  workspaceId: string,
  nodes: Node[],
  edges: Edge[],
  lastFocusedDeskId?: string | null,
): StudioBinding | null {
  // 优先 lastFocused
  if (lastFocusedDeskId) {
    const desk = nodes.find((n) => n.id === lastFocusedDeskId && n.type === 'storyboard-desk');
    if (desk) {
      return {
        workspaceId,
        chainRootNodeId: desk.id,
        source: 'canvas',
        scriptDeskId: findUpstreamScriptDesk(desk.id, nodes, edges),
      };
    }
  }
  // 取第一个 storyboard-desk
  const firstDesk = nodes.find((n) => n.type === 'storyboard-desk');
  if (firstDesk) {
    return {
      workspaceId,
      chainRootNodeId: firstDesk.id,
      source: 'production-studio',
      scriptDeskId: findUpstreamScriptDesk(firstDesk.id, nodes, edges),
    };
  }
  return null;
}

/**
 * 获取绑定链的所有镜头。
 */
export function getChainShots(binding: StudioBinding, nodes: Node[]): StoryboardShot[] {
  const desk = nodes.find((n) => n.id === binding.chainRootNodeId);
  if (!desk) return [];
  const chain = readChainStoryboard(desk.data as Record<string, unknown>);
  return chain?.shots ?? [];
}

/**
 * 更新绑定链的单个镜头。
 * @param updateNodeData - React Flow updateNodeData 函数
 */
export function patchShot(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  getNodes: () => Node[],
  binding: StudioBinding,
  shotId: string,
  patch: Partial<StoryboardShot>,
): void {
  const nodes = getNodes();
  const desk = nodes.find((n) => n.id === binding.chainRootNodeId);
  if (!desk) return;
  const chain = readChainStoryboard(desk.data as Record<string, unknown>);
  if (!chain) return;
  const newShots = patchChainShotShared(chain, shotId, patch);
  const updated = buildChainStoryboardPayload(chain, { shots: newShots });
  updateNodeData(binding.chainRootNodeId, { chainStoryboard: updated } as Record<string, unknown>);
}

/**
 * 替换绑定链的所有镜头。
 */
export function setChainShots(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  binding: StudioBinding,
  nodes: Node[],
  shots: StoryboardShot[],
): void {
  const desk = nodes.find((n) => n.id === binding.chainRootNodeId);
  const chain = desk ? readChainStoryboard(desk.data as Record<string, unknown>) : undefined;
  const updated = buildChainStoryboardPayload(chain, { shots });
  updateNodeData(binding.chainRootNodeId, { chainStoryboard: updated } as Record<string, unknown>);
}

/**
 * 获取绑定链的剧本计划（从上游 script-desk 读取）。
 * 兼容 data.package（ScreenplayPackage）与 data.scriptPlan / ScriptPlanPayload 字段。
 */
export function getScriptPackage(binding: StudioBinding, nodes: Node[]): ScriptPlanPayload | undefined {
  if (!binding.scriptDeskId) return undefined;
  const scriptDesk = nodes.find((n) => n.id === binding.scriptDeskId);
  if (!scriptDesk) return undefined;
  const data = scriptDesk.data as Record<string, unknown>;
  if (data.scriptPlan && typeof data.scriptPlan === 'object') {
    return data.scriptPlan as ScriptPlanPayload;
  }
  const pkg = data.package as ScreenplayPackage | undefined;
  if (!pkg) return undefined;
  const fullText = screenplayFullText(pkg).trim();
  const source = fullText || pkg.brief?.logline || pkg.brief?.topic || pkg.brief?.title || '';
  return {
    version: 2,
    sourceText: source,
    screenplayMd: source,
    storyboardTable: [],
    skeleton: null,
    adaptation: null,
  };
}

/**
 * 写入剧本计划到绑定链的剧本台（SSOT）。
 * 仅写入 data.scriptPlan，不覆盖 data.package（ScreenplayPackage 字段归 ScriptDeskBlock 管理）。
 */
export function setScriptPackage(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  binding: StudioBinding,
  pkg: ScriptPlanPayload,
): void {
  if (!binding.scriptDeskId) return;
  updateNodeData(binding.scriptDeskId, { scriptPlan: pkg } as Record<string, unknown>);
}

/**
 * 查找 storyboard-desk 上游的 script-desk 节点。
 */
function findUpstreamScriptDesk(
  deskId: string,
  nodes: Node[],
  edges: Edge[],
): string | undefined {
  const incoming = edges.filter((e) => e.target === deskId);
  for (const edge of incoming) {
    const source = nodes.find((n) => n.id === edge.source);
    if (source?.type === 'script-desk') return source.id;
  }
  return undefined;
}

/**
 * 制作台写入 shot patch：只写链（F-002/F-003 SSOT），不再双写全局。
 */
export function patchStudioShot(
  binding: StudioBinding | null,
  nodes: Node[],
  updateNodeDataFn: (id: string, patch: Record<string, unknown>) => void,
  shotId: string,
  patch: Partial<StoryboardShot>,
): void {
  if (!binding) return;
  const deskNode = nodes.find((n) => n.id === binding.chainRootNodeId);
  if (!deskNode) return;
  const chain = readChainStoryboard(deskNode.data as Record<string, unknown>);
  if (!chain) return;
  const newShots = (chain.shots ?? []).map((s) =>
    s.id === shotId ? { ...s, ...patch } : s,
  );
  updateNodeDataFn(binding.chainRootNodeId, {
    chainStoryboard: { ...chain, shots: newShots },
  } as Record<string, unknown>);
}

/** 列出画布上全部分镜台，供制作台多链下拉 */
export function listStoryboardDesks(nodes: Node[]): Array<{ id: string; label: string; shotCount: number }> {
  return nodes
    .filter((n) => n.type === 'storyboard-desk')
    .map((n) => {
      const chain = readChainStoryboard(n.data as Record<string, unknown>);
      const title =
        (typeof (n.data as Record<string, unknown>)?.label === 'string'
          ? ((n.data as Record<string, unknown>).label as string)
          : null) ||
        chain?.title ||
        n.id.slice(0, 8);
      return { id: n.id, label: title, shotCount: chain?.shots?.length ?? 0 };
    });
}
