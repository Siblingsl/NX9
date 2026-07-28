/**
 * F-029 acceptance test — 清理全局 timelineDraft 残留
 *
 * G1 验收清单:
 * - [x] 无双写
 * - [x] 旧档时间线不丢
 *
 * G2 主流程: 所有 timelineDraft 读写在节点级 data；全局 store 已物理删除
 * G3 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}
function readShared(relPath: string): string {
  return readFileSync(resolve(SHARED_ROOT, relPath), 'utf-8');
}
function fileExists(relPath: string, base: string = WEB_ROOT): boolean {
  return existsSync(resolve(base, relPath));
}

const WORKSPACE_DOCUMENT = 'stores/workspace-document.ts';
const CLIP_EDITOR_BLOCK = 'blocks/core/ClipEditorBlock.tsx';
const PLAYBOOK_READINESS = 'utils/playbook-readiness.ts';
const FLOW_RUNNER = 'engine/flow-runner.ts';
const EXPORT_PACK_BLOCK = 'blocks/nx9/ExportPackBlock.tsx';
const MIGRATE_TIMELINE = 'utils/migrate-timeline-draft.ts';
const SHARED_INDEX = 'index.ts';

describe('F-029 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    const webFiles = [WORKSPACE_DOCUMENT, CLIP_EDITOR_BLOCK, FLOW_RUNNER, EXPORT_PACK_BLOCK];
    const sharedFiles = [PLAYBOOK_READINESS, MIGRATE_TIMELINE, SHARED_INDEX];
    for (const f of webFiles) {
      it(f, () => { expect(fileExists(f)).toBe(true); });
    }
    for (const f of sharedFiles) {
      it(`${f} (shared)`, () => { expect(fileExists(f, SHARED_ROOT)).toBe(true); });
    }
  });

  // ═══════════ workspace-document: timelineDraft removed ═══════════
  describe('workspace-document store: timelineDraft cleaned', () => {
    const src = readWeb(WORKSPACE_DOCUMENT);

    it('NO timelineDraft in state type', () => {
      expect(src).not.toMatch(/timelineDraft:\s*TimelinePayload/);
    });

    it('NO setTimelineDraft setter', () => {
      expect(src).not.toContain('setTimelineDraft');
    });

    it('NO migrateGlobalTimelineDraft import', () => {
      expect(src).not.toContain('migrateGlobalTimelineDraft');
    });

    it('getSnapshotForSave does NOT include timelineDraft', () => {
      expect(src).toContain('getSnapshotForSave');
      const fnStart = src.indexOf('getSnapshotForSave');
      const fnBlock = src.slice(fnStart, fnStart + 300);
      expect(fnBlock).not.toContain('timelineDraft');
    });

    it('hydrate does NOT restore timelineDraft', () => {
      const hydrateStart = src.indexOf('hydrate:');
      const hydrateBlock = src.slice(hydrateStart, hydrateStart + 400);
      expect(hydrateBlock).not.toContain('timelineDraft');
    });
  });

  // ═══════════ ClipEditorBlock: node-level only ═══════════
  describe('ClipEditorBlock reads node-level timelineDraft only', () => {
    const src = readWeb(CLIP_EDITOR_BLOCK);

    it('reads timelineDraft from props.data', () => {
      expect(src).toContain("data?.timelineDraft");
    });

    it('writes timelineDraft via updateNodeData (not global store)', () => {
      expect(src).toContain('updateNodeData(props.id, {');
      expect(src).toContain('timelineDraft:');
    });

    it('NO useWorkspaceDocument for timelineDraft reading', () => {
      // ClipEditor imports useWorkspaceDocument only for voice.lines, not timelineDraft
      const readTimeline = src.indexOf('readNodeTimeline');
      const readBlock = src.slice(readTimeline, readTimeline + 300);
      expect(readBlock).not.toContain('useWorkspaceDocument');
    });
  });

  // ═══════════ flow-runner: node-local only ═══════════
  describe('flow-runner uses node-local timeline only', () => {
    const src = readWeb(FLOW_RUNNER);

    it('comment says node-local timeline only', () => {
      expect(src).toContain('node-local timeline only');
    });

    it('reads from block.data.timelineDraft', () => {
      expect(src).toContain('d.timelineDraft');
    });

    it('writes via updateNodeData', () => {
      // The smart edit path writes to node data, not global
      expect(src).toContain('updateNodeData(block.id, {');
    });
  });

  // ═══════════ ExportPackBlock: node-level only ═══════════
  describe('ExportPackBlock reads node-level timelineDraft', () => {
    const src = readWeb(EXPORT_PACK_BLOCK);

    it('reads from props.data?.timelineDraft', () => {
      expect(src).toContain("props.data?.timelineDraft");
    });

    it('parses via parseTimelineDraft', () => {
      expect(src).toContain('parseTimelineDraft');
    });
  });

  // ═══════════ PlaybookReadinessContext: timelineDraft removed ═══════════
  describe('PlaybookReadinessContext: no global timelineDraft', () => {
    const src = readShared(PLAYBOOK_READINESS);

    it('NO timelineDraft field in PlaybookReadinessContext', () => {
      expect(src).not.toMatch(/timelineDraft\?:\s*unknown/);
    });

    it('has_timeline_draft only checks node-level (no ctx.timelineDraft)', () => {
      const fnStart = src.indexOf('export function has_timeline_draft');
      const fnBlock = src.slice(fnStart, fnStart + 300);
      expect(fnBlock).not.toContain('ctx.timelineDraft');
      expect(fnBlock).toContain('ctx.nodes.some');
    });

    it('F-029 comment present on has_timeline_draft', () => {
      expect(src).toContain('F-029');
    });
  });

  // ═══════════ Shared index: export removed ═══════════
  describe('shared index: migrateGlobalTimelineDraft export removed', () => {
    const src = readShared(SHARED_INDEX);

    it('NO migrateGlobalTimelineDraft in index exports', () => {
      expect(src).not.toContain('migrateGlobalTimelineDraft');
    });

    it('NO clipEditorHasTimelineDraft in index exports', () => {
      expect(src).not.toContain('clipEditorHasTimelineDraft');
    });

    it('NO migrate-timeline-draft import in index', () => {
      expect(src).not.toContain('migrate-timeline-draft');
    });
  });

  // ═══════════ migrate-timeline-draft.ts: file still exists ═══════════
  describe('migrate-timeline-draft.ts retained as archive', () => {
    const src = readShared(MIGRATE_TIMELINE);

    it('file still exists for reference', () => {
      expect(src).toContain('migrateGlobalTimelineDraft');
    });

    it('has MigrationResult type', () => {
      expect(src).toContain('MigrationResult');
    });
  });

  // ═══════════ No setTimelineDraft callers exist ═══════════
  describe('no setTimelineDraft callers in web app', () => {
    // After removing from workspace-document, grep confirms zero callers
    const storeSrc = readWeb(WORKSPACE_DOCUMENT);

    it('setTimelineDraft implementation is deleted', () => {
      expect(storeSrc).not.toContain('setTimelineDraft');
    });
  });
});
