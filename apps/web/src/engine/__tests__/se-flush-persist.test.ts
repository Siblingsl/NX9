/**
 * SE-FLUSH: 页面卸载时防抖窗口内的未存改动必须尽力落盘。
 * - FlowSurface 在 pagehide 时用待存快照发起 keepalive PUT；
 * - api client 提供 saveWorkspaceKeepalive（PUT + 鉴权头 + keepalive）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../..');

function read(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('SE-FLUSH 卸载落盘', () => {
  it('FlowSurface 监听 pagehide 并 flush 待存快照', () => {
    const src = read('engine/FlowSurface.tsx');
    expect(src).toContain("addEventListener('pagehide'");
    expect(src).toContain('saveQueuedRef.current || lastSaveRef.current');
    expect(src).toContain('api.saveWorkspaceKeepalive(pending.workspaceId, payload)');
    // 卸载路径必须尊重加载期跳过标记，避免把空画布覆盖上服务端
    expect(src).toContain('if (skipSaveRef.current) return;');
  });

  it('client 提供 keepalive 保存（PUT + 鉴权头）', () => {
    const src = read('api/client.ts');
    expect(src).toContain('saveWorkspaceKeepalive');
    expect(src).toMatch(/saveWorkspaceKeepalive[\s\S]*?method: 'PUT'/);
    expect(src).toMatch(/saveWorkspaceKeepalive[\s\S]*?keepalive: true/);
    expect(src).toMatch(/saveWorkspaceKeepalive[\s\S]*?userHeaders\(\)/);
  });

  it('SE-DUAL-WRITE-FIX: 镜像保存不再 read→modify→write 覆盖画布新数据', () => {
    const src = read('stores/persist-mirrored-workspace.ts');
    expect(src).not.toContain('api.loadWorkspace');
    expect(src).toContain('toPayload(nodes, edges');
    // 保留防抖与 flush 入口（制作台 F-002 链路不变）
    expect(src).toContain('schedulePersistMirroredWorkspace');
    expect(src).toContain('flushPersistMirroredWorkspace');
  });

  it('SE-RESUME: 批量运行进度与历史版本按工作区持久化', () => {
    const queue = read('stores/execution-queue.ts');
    expect(queue).toContain('nx9-exec-queue:');
    expect(queue).toContain('hydrateExecutionQueue');
    // 刷新后原 running 诚实降级为 paused + interruptedAt，不假装还在跑
    expect(queue).toContain("wasRunning ? 'paused' : snap.phase");
    expect(queue).toContain('interruptedAt');
    const history = read('stores/version-history.ts');
    expect(history).toContain('nx9-version-history:');
    expect(history).toContain('hydrateVersionHistory');
    expect(history).toContain('MAX_PERSISTED_SNAPSHOTS');
    // 两个 hydrate 都在工作区加载时接线
    const surface = read('engine/FlowSurface.tsx');
    expect(surface).toContain('hydrateExecutionQueue(workspaceId)');
    expect(surface).toContain('hydrateVersionHistory(workspaceId)');
  });
});
