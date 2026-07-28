/**
 * 将 flow-graph-mirror 写回服务端工作区（F-002：制作台改镜后画布可见）。
 */
import type { Viewport } from '@xyflow/react';
import { api } from '../api/client';
import { toPayload } from '../engine/flow-payload';
import { useFlowGraphMirror } from './flow-graph-mirror';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;

export async function persistMirroredWorkspaceNow(): Promise<void> {
  const { workspaceId, nodes, edges } = useFlowGraphMirror.getState();
  if (!workspaceId || nodes.length === 0) return;
  const existing = await api.loadWorkspace(workspaceId);
  const viewport = (existing.viewport ?? { x: 0, y: 0, zoom: 1 }) as Viewport;
  const nextIndex =
    typeof (existing as { nextBlockIndex?: number }).nextBlockIndex === 'number'
      ? (existing as { nextBlockIndex: number }).nextBlockIndex
      : nodes.length + 1;
  const payload = toPayload(nodes, edges, viewport, nextIndex, {
    version: existing.version === 3 ? 3 : 2,
    aliases: (existing as { aliases?: Record<string, string> }).aliases,
    viewMode: (existing as { viewMode?: 'produce' | 'review' }).viewMode,
    takes: (existing as { takes?: unknown[] }).takes as never,
    groups: (existing as { groups?: unknown[] }).groups as never,
    lanes: (existing as { lanes?: unknown }).lanes as never,
  });
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
