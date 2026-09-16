/**
 * 新增工作流模板回归（本会话增量能力：多格推演 / 角色设定表 / BGM 节拍运镜）。
 *
 * 与 multi-grid-plan.test.ts 同口径：import 走**相对路径直取 shared 源码**，
 * 绕开 `packages/shared/src/index.ts` 引用 8 个不存在模块的既有缺陷（barrel 无法解析）。
 * workflow-templates.ts 自身只 `import type`，不引入 shared 运行时依赖，可独立加载。
 *
 * 覆盖：
 * 1. 新增模板存在、id 唯一、label/description/category/status 齐备；
 * 2. `build()` 产出的 blocks/links 自洽：edge 端点必须是本模板内的真实 block id，
 *    节点 kind 必须是目录里真实存在的 kind；
 * 3. 连线合法性：kind 对通过 validateLink，handle id 落在该节点的 accepts/emits 内
 *    （含侧栏 anchor 口），避免渲染出「找不到 handle」的悬空边；
 * 4. 既有 28 条模板**逐条 id 与原顺序未变**（只追加，不改写）。
 */
import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  listWorkflowTemplates,
  type WorkflowTemplate,
} from '../../../../../packages/shared/src/data/workflow-templates';
import {
  BLOCK_CATALOG,
  BLOCK_GROUPS,
  INTERNAL_BLOCKS,
  getDockBlocks,
  lookupBlock,
} from '../../../../../packages/shared/src/catalog/block-catalog';
import {
  resolveAccepts,
  resolveEmits,
  validateLink,
} from '../../../../../packages/shared/src/catalog/socket-registry';

/** 增量新增的 5 条模板 id（顺序即模板选择器分组顺序） */
const NEW_TEMPLATE_IDS = [
  'tpl-multigrid-multicam',
  'tpl-multigrid-story',
  'tpl-multigrid-frame',
  'tpl-character-sheet-desk',
  'tpl-bgm-beat-camera',
] as const;

/** 追加前的既有 28 条模板 id（原顺序照抄，用于核对「只追加、未改写」） */
const BASELINE_TEMPLATE_IDS = [
  'tpl-nx9-character-pipeline',
  'tpl-text-to-picture',
  'tpl-image-to-clip',
  'tpl-storyboard-grid',
  'tpl-character-turnaround',
  'tpl-grid-vision',
  'tpl-photo-speak',
  'tpl-shot-script-desk',
  'tpl-nx9-review-pipeline',
  'tpl-reference-picture',
  'tpl-batch-pictures',
  'tpl-av-post',
  'tpl-spatial-pipeline',
  'tpl-sclass-seedance',
  'tpl-novel-import',
  'tpl-vertical-episode',
  'tpl-contact-sheet',
  'tpl-voice-drama',
  'tpl-link-replicate',
  'tpl-ecom-image',
  'tpl-ecom-video',
  'tpl-bridge-sequence',
  'tpl-cover-export',
  'tpl-toonflow-lite',
  'tpl-line-art-storyboard',
  'tpl-3d-preview',
  'tpl-core-episode',
  'tpl-ai-short-film',
] as const;

const VALID_CATEGORIES = ['video', 'image', 'story', 'tool'];
const VALID_STATUSES = ['ga', 'beta', 'deprecated'];

function templateById(id: string): WorkflowTemplate {
  const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === id);
  if (!tpl) throw new Error(`模板不存在：${id}`);
  return tpl;
}

describe('新增工作流模板：目录与元数据', () => {
  it('5 条新模板全部存在，且 id 全局唯一', () => {
    const allIds = WORKFLOW_TEMPLATES.map((t) => t.id);
    for (const id of NEW_TEMPLATE_IDS) {
      expect(allIds, `缺少新模板 ${id}`).toContain(id);
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('新模板 label / description 非空，category / status 合法', () => {
    for (const id of NEW_TEMPLATE_IDS) {
      const tpl = templateById(id);
      expect(tpl.label.trim(), `${id} label 为空`).not.toBe('');
      expect(tpl.description.trim(), `${id} description 为空`).not.toBe('');
      expect(tpl.description.length, `${id} description 过短，不像可用说明`).toBeGreaterThan(10);
      expect(VALID_CATEGORIES, `${id} category 非法`).toContain(tpl.category);
      expect(VALID_STATUSES, `${id} status 非法`).toContain(tpl.status);
    }
  });

  it('新模板对启动器可见（非 deprecated），且覆盖 video / story 两类', () => {
    const listed = listWorkflowTemplates().map((t) => t.id);
    for (const id of NEW_TEMPLATE_IDS) {
      expect(listed, `${id} 被 deprecated 隐藏，无法一键拉起`).toContain(id);
    }
    const categories = NEW_TEMPLATE_IDS.map((id) => templateById(id).category);
    expect(categories).toContain('video');
    expect(categories).toContain('story');
  });
});

describe('新增工作流模板：build() 自洽性', () => {
  it('每条模板节点非空、节点 id 唯一、kind 在目录中真实存在', () => {
    for (const id of NEW_TEMPLATE_IDS) {
      const { blocks } = templateById(id).build();
      expect(blocks.length, `${id} 没有节点`).toBeGreaterThan(0);
      const blockIds = blocks.map((b) => b.id);
      expect(new Set(blockIds).size, `${id} 节点 id 重复`).toBe(blockIds.length);
      for (const block of blocks) {
        expect(
          lookupBlock(block.type),
          `${id} 引用了不存在的节点 kind：${block.type}`,
        ).toBeDefined();
        expect(typeof block.position.x).toBe('number');
        expect(typeof block.position.y).toBe('number');
      }
    }
  });

  it('每条模板至少有一条连线，且 edge 端点都是本模板内真实节点 id', () => {
    for (const id of NEW_TEMPLATE_IDS) {
      const { blocks, links } = templateById(id).build();
      expect(links.length, `${id} 没有连线，无法「一键拉起」`).toBeGreaterThan(0);
      const blockIds = new Set(blocks.map((b) => b.id));
      const linkIds = links.map((l) => l.id);
      expect(new Set(linkIds).size, `${id} 连线 id 重复`).toBe(linkIds.length);
      for (const link of links) {
        expect(blockIds.has(link.source), `${id} edge.source 非本模板节点：${link.source}`).toBe(
          true,
        );
        expect(blockIds.has(link.target), `${id} edge.target 非本模板节点：${link.target}`).toBe(
          true,
        );
        expect(link.source).not.toBe(link.target);
      }
    }
  });

  it('连线类型合法（validateLink），且没有重复边', () => {
    for (const id of NEW_TEMPLATE_IDS) {
      const { blocks, links } = templateById(id).build();
      const typeById = new Map(blocks.map((b) => [b.id, b.type]));
      const dataById = new Map(blocks.map((b) => [b.id, b.data ?? {}]));
      const seen = new Set<string>();
      for (const link of links) {
        const sourceKind = typeById.get(link.source)!;
        const targetKind = typeById.get(link.target)!;
        expect(
          validateLink(sourceKind, targetKind, dataById.get(link.source), dataById.get(link.target)),
          `${id}：${sourceKind} → ${targetKind} 口型不兼容`,
        ).toBe(true);
        const key = `${link.source}->${link.target}`;
        expect(seen.has(key), `${id} 重复边 ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('显式 handle 必须落在该节点的 accepts / emits 内（避免悬空边）', () => {
    for (const id of NEW_TEMPLATE_IDS) {
      const { blocks, links } = templateById(id).build();
      const typeById = new Map(blocks.map((b) => [b.id, b.type]));
      const dataById = new Map(blocks.map((b) => [b.id, b.data ?? {}]));
      for (const link of links) {
        const sourceKind = typeById.get(link.source)!;
        const targetKind = typeById.get(link.target)!;
        if (link.sourceHandle) {
          const emits = resolveEmits(sourceKind, dataById.get(link.source));
          expect(
            emits,
            `${id}：${sourceKind} 没有 ${link.sourceHandle} 出口`,
          ).toContain(link.sourceHandle);
        }
        if (link.targetHandle) {
          const accepts = resolveAccepts(targetKind, dataById.get(link.target));
          expect(
            accepts,
            `${id}：${targetKind} 没有 ${link.targetHandle} 入口`,
          ).toContain(link.targetHandle);
        }
      }
    }
  });

  it('新模板确实用到本会话新增的两个节点 kind', () => {
    const usedKinds = new Set(
      NEW_TEMPLATE_IDS.flatMap((id) => templateById(id).build().blocks.map((b) => b.type)),
    );
    expect(usedKinds.has('multi-grid')).toBe(true);
    expect(usedKinds.has('character-sheet-desk')).toBe(true);
  });
});

describe('既有模板未被改写（只追加）', () => {
  it('总数 = 既有 28 + 新增 5', () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(BASELINE_TEMPLATE_IDS.length + NEW_TEMPLATE_IDS.length);
  });

  it('既有 28 条模板 id 与顺序逐条未变', () => {
    const actual = WORKFLOW_TEMPLATES.slice(0, BASELINE_TEMPLATE_IDS.length).map((t) => t.id);
    expect(actual).toEqual([...BASELINE_TEMPLATE_IDS]);
  });

  it('新模板只出现在既有 28 条之后（追加，未插队）', () => {
    const tail = WORKFLOW_TEMPLATES.slice(BASELINE_TEMPLATE_IDS.length).map((t) => t.id);
    expect(tail).toEqual([...NEW_TEMPLATE_IDS]);
  });

  it('既有模板的 build() 仍可构造（回归：追加未破坏既有闭包）', () => {
    for (const id of BASELINE_TEMPLATE_IDS) {
      const built = templateById(id).build();
      expect(built.blocks.length, `${id} 节点被清空`).toBeGreaterThan(0);
      const blockIds = new Set(built.blocks.map((b) => b.id));
      for (const link of built.links) {
        expect(blockIds.has(link.source), `${id} 既有边失效：${link.source}`).toBe(true);
        expect(blockIds.has(link.target), `${id} 既有边失效：${link.target}`).toBe(true);
      }
    }
  });
});

describe('入口收敛：新节点与新模板都可被发现', () => {
  it('multi-grid / character-sheet-desk 进目录、进 Dock、进生成分组', () => {
    for (const kind of ['multi-grid', 'character-sheet-desk']) {
      expect(lookupBlock(kind), `${kind} 未登记进目录`).toBeDefined();
      expect(BLOCK_CATALOG.filter((b) => b.kind === kind), `${kind} 目录重复登记`).toHaveLength(1);
      expect(getDockBlocks().map((b) => b.kind), `${kind} 不在 Dock 可见列表`).toContain(kind);
      expect(
        BLOCK_GROUPS.generate.items.map((b) => b.kind),
        `${kind} 不在生成分组`,
      ).toContain(kind);
    }
  });

  it('目录 kind 全局唯一（新增未覆盖既有导出）', () => {
    const kinds = [...BLOCK_CATALOG, ...INTERNAL_BLOCKS].map((b) => b.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('新模板在命令面板 / 模板面板的数据源里可见（同一 listWorkflowTemplates）', () => {
    const listed = listWorkflowTemplates();
    for (const id of NEW_TEMPLATE_IDS) {
      expect(listed.map((t) => t.id)).toContain(id);
    }
    // WorkflowTemplatesPanel 按 category 分组渲染：新模板必须落进已存在的分组键
    const panelKeys = ['video', 'image', 'story', 'tool'];
    for (const id of NEW_TEMPLATE_IDS) {
      expect(panelKeys).toContain(templateById(id).category);
    }
  });
});
