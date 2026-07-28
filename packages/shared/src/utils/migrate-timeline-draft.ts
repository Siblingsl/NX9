/**
 * migrate-timeline-draft.ts — 全局 timelineDraft 迁移（F-029）。
 *
 * 旧档只有全局 timelineDraft 时，灌入「主 clip-editor」节点一次。
 * 之后禁止双写。
 */
import type { TimelinePayload } from '../types/timeline';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any; // 避免 shared 包依赖 @xyflow/react

export interface MigrationResult {
  migrated: boolean;
  targetNodeId?: string;
  message: string;
}

/**
 * 将全局 timelineDraft 迁移到 clip-editor 节点 data。
 * 仅在全局有 draft 且没有 clip-editor 节点已有 timelineDraft 时执行。
 */
export function migrateGlobalTimelineDraft(
  globalDraft: TimelinePayload | null | undefined,
  nodes: Node[],
): MigrationResult {
  if (!globalDraft) {
    return { migrated: false, message: '无全局 timelineDraft 需要迁移' };
  }

  // 找已有的 clip-editor 节点
  const clipEditors = nodes.filter((n) => n.type === 'clip-editor');
  if (clipEditors.length === 0) {
    // 没有 clip-editor，保留全局 draft 不变
    return { migrated: false, message: '无可迁移的 clip-editor 节点' };
  }

  // 取第一个没有 timelineDraft 的 clip-editor
  const target = clipEditors.find((n) => {
    const data = n.data as Record<string, unknown>;
    return !data.timelineDraft;
  }) ?? clipEditors[0];

  return {
    migrated: true,
    targetNodeId: target.id,
    message: `已迁移 timelineDraft 到节点 ${target.id}`,
  };
}

/**
 * 检查 clip-editor 节点是否已有 timelineDraft。
 */
export function clipEditorHasTimelineDraft(nodeData: Record<string, unknown>): boolean {
  const draft = nodeData.timelineDraft as TimelinePayload | undefined;
  return !!draft && Array.isArray(draft.tracks) && draft.tracks.length > 0;
}
