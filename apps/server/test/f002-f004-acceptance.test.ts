/**
 * F-002 / F-003 / F-004 行为验收
 * 等价手工勾选：画布↔制作台互见 / 双 Desk 隔离 / 无上游不误批
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildChainStoryboardPayload,
  migrateGlobalToChainStoryboard,
  patchChainShot,
  readChainStoryboard,
  resolveUpstreamShotsFromGraph,
  type StoryboardShot,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');

function mkShot(id: string, index: number, title: string): StoryboardShot {
  return {
    id,
    index,
    descriptionZh: title,
    promptEn: title,
  } as StoryboardShot;
}

describe('F-002 画布↔制作台互见（链 SSOT）', () => {
  it('写链后读链立即可见同一改动（制作台↔画布同源语义）', () => {
    let chain = buildChainStoryboardPayload(undefined, {
      shots: [mkShot('s1', 1, '原标题')],
    });
    // 模拟 patchStudioShot：只改 chainStoryboard.shots
    const nextShots = patchChainShot(chain, 's1', { descriptionZh: '制作台改名' });
    chain = buildChainStoryboardPayload(chain, { shots: nextShots });

    // 模拟画布侧 readChainStoryboard
    const deskData = { chainStoryboard: chain };
    const visible = readChainStoryboard(deskData);
    expect(visible?.shots).toHaveLength(1);
    expect(visible?.shots[0].descriptionZh).toBe('制作台改名');
  });

  it('制作台源码走 flow-graph-mirror 且不依赖 useReactFlow', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/pages/studio/useStudioDesk.ts'),
      'utf8',
    );
    expect(src.includes('useFlowGraphMirror')).toBe(true);
    expect(src.includes("from '@xyflow/react'")).toBe(false);
    expect(src.includes('schedulePersistMirroredWorkspace')).toBe(true);
    expect(src.includes('patchStudioShot')).toBe(true);
  });
});

describe('F-003 双 Desk 隔离', () => {
  it('两 desk 各有镜头时，clip-gen 仅吃连入 desk 的镜', () => {
    const nodes = [
      {
        id: 'desk-a',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: buildChainStoryboardPayload(undefined, {
            shots: [mkShot('a1', 1, 'A1'), mkShot('a2', 2, 'A2')],
          }),
        },
      },
      {
        id: 'desk-b',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: buildChainStoryboardPayload(undefined, {
            shots: [mkShot('b1', 1, 'B1'), mkShot('b2', 2, 'B2'), mkShot('b3', 3, 'B3')],
          }),
        },
      },
      { id: 'clip-1', type: 'clip-gen', data: {} },
    ];
    const edges = [{ source: 'desk-a', target: 'clip-1' }];

    const result = resolveUpstreamShotsFromGraph('clip-1', nodes, edges);
    expect(result.hasUpstream).toBe(true);
    expect(result.shotIds.sort()).toEqual(['a1', 'a2']);
    expect(result.shots.every((s) => s.id.startsWith('a'))).toBe(true);
  });

  it('连 desk-b 时不串 desk-a 镜头', () => {
    const nodes = [
      {
        id: 'desk-a',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: buildChainStoryboardPayload(undefined, {
            shots: [mkShot('a1', 1, 'A1')],
          }),
        },
      },
      {
        id: 'desk-b',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: buildChainStoryboardPayload(undefined, {
            shots: [mkShot('b1', 1, 'B1')],
          }),
        },
      },
      { id: 'clip-1', type: 'clip-gen', data: {} },
    ];
    const result = resolveUpstreamShotsFromGraph('clip-1', nodes, [
      { source: 'desk-b', target: 'clip-1' },
    ]);
    expect(result.shotIds).toEqual(['b1']);
  });

  it('旧档迁移不丢镜', () => {
    const migrated = migrateGlobalToChainStoryboard({
      title: '旧档',
      shots: [mkShot('g1', 1, 'G1'), mkShot('g2', 2, 'G2')],
    });
    expect(migrated.shots.map((s) => s.id)).toEqual(['g1', 'g2']);
    expect(migrated.shots[0].descriptionZh).toBe('G1');
  });

  it('聚合默认禁全局回退', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/engine/chain-storyboard-aggregate.ts'),
      'utf8',
    );
    expect(src.includes('默认不回退全局')).toBe(true);
  });
});

describe('F-004 无上游不误批', () => {
  it('无入边 → 上游镜头为空（即使图上别 desk 有镜）', () => {
    const nodes = [
      {
        id: 'desk-a',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: buildChainStoryboardPayload(undefined, {
            shots: [mkShot('a1', 1, 'A1')],
          }),
        },
      },
      { id: 'clip-orphan', type: 'clip-gen', data: {} },
    ];
    const result = resolveUpstreamShotsFromGraph('clip-orphan', nodes, []);
    expect(result.hasUpstream).toBe(false);
    expect(result.shots).toEqual([]);
    expect(result.shotIds).toEqual([]);
  });

  it('batchGenerate / ClipGen / Playbook / VideoWorkspace / hook 禁全局', () => {
    const batch = readFileSync(
      resolve(root, 'apps/web/src/engine/core-pipeline-runner.ts'),
      'utf8',
    );
    const clip = readFileSync(
      resolve(root, 'apps/web/src/blocks/core/ClipGenBlock.tsx'),
      'utf8',
    );
    const playbook = readFileSync(
      resolve(root, 'apps/web/src/engine/playbook-runner.ts'),
      'utf8',
    );
    const videoWs = readFileSync(
      resolve(
        root,
        'apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx',
      ),
      'utf8',
    );
    const upstreamHook = readFileSync(
      resolve(
        root,
        'apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/use-upstream-shots.ts',
      ),
      'utf8',
    );

    expect(batch.includes('禁止回退全局')).toBe(true);
    expect(clip.includes('禁止写全局')).toBe(true);
    expect(playbook.includes('禁止误批全局') || playbook.includes('无链镜表时阻断')).toBe(true);
    expect(videoWs.includes('禁止写全局')).toBe(true);
    expect(upstreamHook.includes('useWorkspaceDocument')).toBe(false);
    expect(upstreamHook.includes('resolveUpstreamShotsFromGraph')).toBe(true);
  });
});
