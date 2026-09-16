/**
 * workflow-archive.ts — 画布工作流归档（ZIP）入口的纯逻辑（R2 新增）。
 *
 * 背景：`stage-deck/utils/workflow-zip.ts` 早已实现 `exportWorkflowZip`（选区/全画布
 * `workspace.json` + 内嵌 assets）与 `downloadBlob`，但全仓零调用方；`importWorkflowZip`
 * 也只被 `FlowSurface` 注册进 runtime，没有任何 UI 触发 —— 即「能导入能导出，但都没有入口」。
 * 本模块只承载归档入口的**纯逻辑**（扩展名、文件名、可导出性判定），供
 * `FlowSurface` / `CommandPalette` 复用，便于不依赖 barrel 的单测。
 */

/** 工作流归档扩展名（与 `workflow-zip` 的 ZIP 容器一致）。 */
export const WORKFLOW_ARCHIVE_EXTENSION = 'nx9zip';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 归档文件名：`nx9-workflow-<工作区>-<YYYYMMDD-HHmmss>.nx9zip`。
 * 工作区 id 中的非安全字符归一为 `-`；`workspaceId` 为空时用 `workspace` 兜底。
 */
export function buildWorkflowArchiveFileName(workspaceId: string, at: Date): string {
  const safe = (workspaceId ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stamp = [
    at.getFullYear(),
    pad2(at.getMonth() + 1),
    pad2(at.getDate()),
    '-',
    pad2(at.getHours()),
    pad2(at.getMinutes()),
    pad2(at.getSeconds()),
  ].join('');
  return `nx9-workflow-${safe || 'workspace'}-${stamp}.${WORKFLOW_ARCHIVE_EXTENSION}`;
}

export interface WorkflowArchiveCandidate {
  nodeCount: number;
  edgeCount: number;
  selectionCount: number;
}

/**
 * 可导出性判定：全画布导出要求至少 1 个节点；选区导出要求至少 1 个被选中节点。
 * 返回 `undefined` 表示可导出，否则返回面向用户的中文原因（禁止「空成功」）。
 */
export function workflowArchiveBlockReason(
  candidate: WorkflowArchiveCandidate,
  selectionOnly: boolean,
): string | undefined {
  if (selectionOnly) {
    if (candidate.selectionCount <= 0) return '未选中任何模块，无法导出选区归档';
    return undefined;
  }
  if (candidate.nodeCount <= 0) return '当前画布为空，无法导出工作流归档';
  return undefined;
}
