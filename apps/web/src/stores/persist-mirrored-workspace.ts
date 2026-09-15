/**
 * 将 flow-graph-mirror 写回服务端工作区（F-002：制作台改镜后画布可见）。
 *
 * SE-DUAL-WRITE-FIX: 不再 read→modify→write（避免覆盖画布防抖刚落的新数据），
 * 直接从镜像当前状态 + WorkspaceDocument extras 构建完整 payload 保存。
 */
import { api } from '../api/client';
import { toPayload } from '../engine/flow-payload';
import { useAliasStore } from '../engine/stage-deck/stores/alias-store';
import { useViewMode } from '../engine/stage-deck/stores/view-mode';
import { useTakeStore } from '../engine/stage-deck/stores/take-store';
import { useFlowGraphMirror } from './flow-graph-mirror';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;

export async function persistMirroredWorkspaceNow(): Promise<void> {
  const { workspaceId, nodes, edges, stageDeck } = useFlowGraphMirror.getState();
  if (!workspaceId || nodes.length === 0) return;
  // 用镜像当前数据直接构建 payload（toPayload 会从 WorkspaceDocument 注入业务数据），
  // nextBlockIndex 取 nodes.length + 1 作为安全默认——画布路径会写入精确值，
  // 镜像路径只确保节点/边数据不丢，不会因为读旧档而覆盖画布新落的数据。
  // v3 extras（aliases/viewMode/takes）从内存 store 读取，随 syncGraph 的 stageDeck 标记决定是否携带。
  const payload = toPayload(nodes, edges, { x: 0, y: 0, zoom: 1 }, nodes.length + 1, stageDeck ? {
    version: 3,
    aliases: useAliasStore.getState().exportAliases(),
    viewMode: useViewMode.getState().mode,
    takes: useTakeStore.getState().takes,
  } : { version: 2 });
  await api.saveWorkspace(workspaceId, payload);
}

/** 防抖持久化：制作台连续改镜不打爆 API */
export function schedulePersistMirroredWorkspace(delayMs = 600): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistInFlight = persistMirroredWorkspaceNow().catch((err) => {
      console.warn('[F-002] 制作台镜像存盘失败', err);
    });
  }, delayMs);
}

export function flushPersistMirroredWorkspace(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  return persistInFlight ?? persistMirroredWorkspaceNow();
}
