/**
 * 轻量工作区上下文桥 — 供 API client 读取当前 workspaceId，
 * 避免循环依赖（api/client ← stores/workspace-document → api/client）。
 *
 * 由 workspace-document store 的 hydrate 副作用写入。
 */
let _workspaceId: string | null = null;

export function getCurrentWorkspaceId(): string | null {
  return _workspaceId;
}

export function setCurrentWorkspaceId(id: string | null): void {
  _workspaceId = id;
}
