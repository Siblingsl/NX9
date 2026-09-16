/**
 * 逐帧拉片节点：目录 / socket / 交互 / 工作区 / 运行接线 / 渲染器注册 回归。
 *
 * 与 framework 里既有块映射测试同口径：
 * - 目录、socket、工作区、交互、run-label、gatherUpstream 一律**相对路径直取 shared 源码**
 *   （barrel `packages/shared/src/index.ts` 有既有缺陷，不能经它取源码）；
 * - 前端 loader / flow-runner 接线用源码解析断言（flow-runner 运行时会拉入 barrel）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_CATALOG,
  BLOCK_GROUPS,
  isDockVisible,
  lookupBlock,
} from '../../../../../packages/shared/src/catalog/block-catalog';
import {
  SOCKET_REGISTRY,
  resolveAccepts,
  resolveEmits,
  validateLink,
} from '../../../../../packages/shared/src/catalog/socket-registry';
import {
  ATTACHED_WORKSPACE_REGISTRY,
  resolveAttachedWorkspace,
  shouldUseCompactNodeShell,
} from '../../../../../packages/shared/src/catalog/attached-workspace';
import {
  resolveNodeInteraction,
  resolveNodeInteractionClass,
} from '../../../../../packages/shared/src/catalog/node-interaction';
import { resolveRunLabel } from '../../../../../packages/shared/src/utils/run-labels';
import { gatherUpstream } from '../../../../../packages/shared/src/engine/flow-graph';
import { migrateBlockKind } from '../../../../../packages/shared/src/catalog/migrate-block-kinds';

const KIND = 'frame-study';

describe('逐帧拉片：节点目录注册', () => {
  it('kind=frame-study 登记进目录，且为可见 / 可生成', () => {
    const def = lookupBlock(KIND);
    expect(def).toBeDefined();
    expect(def!.kind).toBe(KIND);
    expect(def!.label).toBe('逐帧拉片');
    expect(def!.category).toBe('generate');
    expect(def!.glyph).toBeTruthy();
    expect(def!.accent).toBeTruthy();
    expect(def!.hint.trim()).not.toBe('');
    expect(def!.nx9Native).toBe(true);
    expect(isDockVisible(def!)).toBe(true);
    expect(BLOCK_CATALOG.filter((b) => b.kind === KIND)).toHaveLength(1);
  });

  it('不是历史废弃 kind：迁移表里没有 frame-study 条目（不会被改写掉）', () => {
    expect(migrateBlockKind(KIND)).toBe(KIND);
  });

  it('目录无重复 kind（新增不覆盖既有导出）', () => {
    const kinds = BLOCK_CATALOG.map((b) => b.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    // 既有 4 个节点仍在目录里
    expect(kinds).toContain('picture-gen');
    expect(kinds).toContain('clip-gen');
    expect(kinds).toContain('multi-grid');
    expect(kinds).toContain('character-sheet-desk');
  });

  it('出现在生成分组中（BLOCK_GROUPS.generate）', () => {
    const ids = BLOCK_GROUPS.generate.items.map((b) => b.kind);
    expect(ids).toContain(KIND);
  });
});

describe('逐帧拉片：socket 契约', () => {
  it('注册 socket：上游视频入，逐帧参考图 + 逐帧提示词出', () => {
    const profile = SOCKET_REGISTRY[KIND];
    expect(profile).toBeDefined();
    expect(profile!.accepts).toContain('clip');
    expect(profile!.emits).toContain('picture');
    expect(profile!.emits).toContain('prompt');
    expect(resolveAccepts(KIND)).toContain('clip');
    expect(resolveEmits(KIND)[0]).toBe('picture');
  });

  it('能与 clip-gen / picture-gen / storyboard-desk 建立连线', () => {
    // 视频入：clip-gen 出 clip → frame-study 收 clip
    expect(validateLink('clip-gen', KIND)).toBe(true);
    // 素材导入露出 clip 出口时同样可连（asset-import 的出口按 data.mediaKind 动态解析）
    expect(validateLink('asset-import', KIND, { mediaKind: 'clip' })).toBe(true);
    // 帧图出：frame-study → 图像 / 宫格 / 视频 / 分镜台
    expect(validateLink(KIND, 'picture-gen')).toBe(true);
    expect(validateLink(KIND, 'clip-gen')).toBe(true);
    expect(validateLink(KIND, 'grid-compose')).toBe(true);
    expect(validateLink(KIND, 'storyboard-desk')).toBe(true);
  });

  it('不接受声音（抽帧与音频无关，避免把音轨当视频连进来）', () => {
    expect(resolveAccepts(KIND)).not.toContain('sound');
  });
});

describe('逐帧拉片：交互与工作区', () => {
  it('登记工作区为 tool 型，走紧凑节点壳（底部跟随工作区）', () => {
    const spec = resolveAttachedWorkspace(KIND);
    expect(spec).toBeDefined();
    expect(spec!.workspaceType).toBe('tool');
    expect(spec!.attachToNode).toBe(true);
    expect(spec!.compactCanvas).toBe(true);
    expect(spec!.showRun).toBe(true);
    expect(ATTACHED_WORKSPACE_REGISTRY[KIND]?.kind).toBe(KIND);
    expect(shouldUseCompactNodeShell(KIND)).toBe(true);
  });

  it('交互 class 归入 logic；点击展开底部跟随工作区（不进 Inspector）', () => {
    expect(resolveNodeInteractionClass(KIND)).toBe('logic');
    expect(resolveNodeInteraction(KIND).opensPromptBar).toBe(true);
    expect(resolveNodeInteraction(KIND).opensInspector).toBe(false);
  });

  it('运行文案注册：主按钮为「抽帧并逐帧反推」', () => {
    expect(resolveRunLabel(KIND).primary).toBe('抽帧并逐帧反推');
    expect(resolveRunLabel(KIND, 'running').primary).toBe('拉片中…');
  });
});

describe('逐帧拉片：下游 gatherUpstream 契约', () => {
  const node = (id: string, type: string, data: Record<string, unknown>) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  });

  it('把逐帧参考图与逐帧提示词交下游', () => {
    const study = node('fs', KIND, {
      frameStudyItems: [
        { index: 0, thumbnailUrl: '/media/exports/f1.jpg', reversePromptEn: 'shot one' },
        { index: 1, thumbnailUrl: '/media/exports/f2.jpg', reversePromptZh: '第二帧' },
        { index: 2, reversePromptEn: 'frame without image' },
      ],
    });
    const out = gatherUpstream('down', [study], [{ id: 'e', source: 'fs', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/exports/f1.jpg', '/media/exports/f2.jpg']);
    expect(out.prompts).toEqual(['shot one', '第二帧', 'frame without image']);
  });

  it('没有逐帧条目时回落 frameStudyFrameUrls / pictures / previewUrl', () => {
    const byUrls = node('fs', KIND, { frameStudyFrameUrls: ['/a.jpg', '/b.jpg'] });
    expect(
      gatherUpstream('down', [byUrls], [{ id: 'e', source: 'fs', target: 'down' }]).pictures,
    ).toEqual(['/a.jpg', '/b.jpg']);

    const byPreview = node('fs', KIND, { previewUrl: '/p.jpg' });
    expect(
      gatherUpstream('down', [byPreview], [{ id: 'e', source: 'fs', target: 'down' }]).pictures,
    ).toEqual(['/p.jpg']);
  });

  it('不重复把上游视频当成本节点产出（避免下游把源视频当帧图）', () => {
    const study = node('fs', KIND, {
      frameStudyVideoUrl: '/media/videos/src.mp4',
      frameStudyItems: [{ index: 0, thumbnailUrl: '/media/exports/f1.jpg' }],
    });
    const out = gatherUpstream('down', [study], [{ id: 'e', source: 'fs', target: 'down' }]);
    expect(out.clips).toEqual([]);
    expect(out.pictures).toEqual(['/media/exports/f1.jpg']);
  });
});

describe('逐帧拉片：运行接线与渲染器注册（源码解析）', () => {
  const runnerSource = readFileSync(resolve(__dirname, '../flow-runner.ts'), 'utf8');
  const registrySource = readFileSync(resolve(__dirname, '../../blocks/registry.tsx'), 'utf8');
  const routerSource = readFileSync(
    resolve(__dirname, '../stage-deck/chrome/attached-workspace/AttachedWorkspaceRouter.tsx'),
    'utf8',
  );

  it('RUNNABLE_BLOCKS 与 executeBlock 分支成对（不会静默 skipped）', () => {
    const runnable = [
      ...(/export const RUNNABLE_BLOCKS = new Set\(\[([\s\S]*?)\]\)/.exec(runnerSource)?.[1] ?? '')
        .matchAll(/'([^']+)'/g),
    ].map((m) => m[1]!);
    expect(runnable).toContain(KIND);
    expect(runnerSource).toContain(`kind === '${KIND}'`);
    expect(runnerSource).toContain('executeFrameStudyOps');
    expect(runnerSource).toContain("from './flow-runner-ops/frame-study-ops'");
  });

  it('前端注册了节点渲染器（lazy chunk）', () => {
    expect(registrySource).toContain(`'${KIND}':`);
    expect(registrySource).toContain('FrameStudyBlock');
  });

  it('底部跟随工作区路由到 FrameStudyWorkspace', () => {
    expect(routerSource).toContain(`kind === '${KIND}'`);
    expect(routerSource).toContain('FrameStudyWorkspace');
  });
});
