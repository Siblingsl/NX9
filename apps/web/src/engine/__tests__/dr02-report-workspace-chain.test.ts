/**
 * DR-02：审片工作区只读/写上游链镜表，禁止回退全局 storyboard。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../stage-deck/chrome/attached-workspace/report/ReportWorkspace.tsx'),
  'utf8',
);

describe('DR-02 ReportWorkspace 链隔离', () => {
  it('镜头来源走 resolveShotsForBlock，写回走 patchUpstreamShot', () => {
    expect(src).toContain('resolveShotsForBlock(blockId, nodes, edges)');
    expect(src).toContain('patchUpstreamShot(updateNodeData, blockId, nodes, edges');
  });

  it('不再读全局 storyboard / updateShot', () => {
    expect(src).not.toContain('activeEpisodeShots');
    expect(src).not.toContain('useWorkspaceDocument');
    expect(src).not.toContain('updateShot(');
  });

  it('写回失败时节点进入 blocked，而非静默全局写', () => {
    expect(src).toContain("status: 'blocked', gatePassed: false");
  });
});
