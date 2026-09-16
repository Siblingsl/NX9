/**
 * 全量工作流模板连线校验（防回归）。
 *
 * 口径：对 `WORKFLOW_TEMPLATES` **全部**模板（既有 28 + 增量 5）逐条 link 跑
 * `validateLink(源 kind, 目标 kind, 源 data, 目标 data)`，任何一条不通过即失败。
 *
 * 为什么单独存在：`workflow-templates-new.test.ts` 只校验新增 5 条；既有模板里曾存留
 * 12 条非法口型边 —— F-013「废弃 kind → 活跃 kind」批量改写时，`preview-sink` /
 * `light-rig` / `depth-pass` / `bridge-clip` / `thumbnail-maker` / `prompt` 分别被并入
 * `asset-import` / `director-desk` / `clip-gen` / `export-pack` / `picture-gen`，
 * 形成「目标不接任何口型」与「同 kind 相连」两类非法边。
 * 修复记录见 `docs/NX9-TEMPLATE-LINK-REPAIR.md`。
 *
 * import 走**相对路径直取 shared 源码**：`packages/shared/src/index.ts` 目前引用
 * 8 个不存在的 `data/*` 模块（既有缺陷），barrel 无法解析；本文件依赖的两个模块均可
 * 独立加载（`workflow-templates.ts` 只 `import type`）。
 */
import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
} from '../../../../../packages/shared/src/data/workflow-templates';
import {
  resolveAccepts,
  resolveEmits,
  resolveVisibleVerticalSockets,
  validateLink,
} from '../../../../../packages/shared/src/catalog/socket-registry';

/** 修复前基线：既有 28 条 + 增量 5 条（顺序即模板选择器分组顺序） */
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
  // ── 增量 5 条 ──
  'tpl-multigrid-multicam',
  'tpl-multigrid-story',
  'tpl-multigrid-frame',
  'tpl-character-sheet-desk',
  'tpl-bgm-beat-camera',
] as const;

/**
 * 修复前实测的非法 `源 kind → 目标 kind` 对（12 条边 / 9 条模板），全部由 F-013 迁移产生。
 * 修复后不得在任何模板中重现。
 */
const REPAIRED_ILLEGAL_PAIRS = [
  'picture-gen → asset-import',
  'clip-gen → asset-import',
  'grid-compose → asset-import',
  'clip-editor → asset-import',
  'picture-gen → picture-gen',
  'director-desk → director-desk',
  'clip-gen → clip-gen',
  'export-pack → export-pack',
] as const;

/**
 * 非法连线白名单（当前为空：修复后全量 33 条模板 0 非法边）。
 *
 * 仅当连线「无法在不改变模板原意的前提下修复、且必须保留」时才允许登记，并必须写清原因；
 * 登记仍需**显式**逐条列出（不是整体跳过校验）。条目若已不再命中非法校验，
 * `白名单条目不得失效` 断言会失败，防止白名单腐烂。
 */
const ILLEGAL_LINK_WHITELIST: { key: string; reason: string }[] = [];

interface TemplateLinkView {
  templateId: string;
  sourceId: string;
  targetId: string;
  sourceKind: string;
  targetKind: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  /** validateLink 结果 */
  legal: boolean;
  /** 显式 handle 是否落在该节点真实口内 */
  handlesResolved: boolean;
}

/** 可见 handle id：左右数据口（emits/accepts）+ 上下能力口（VERTICAL_SOCKETS，受 showExecPorts 控制） */
function visibleHandles(
  kind: string,
  data: Record<string, unknown> | undefined,
): { source: string[]; target: string[] } {
  const source = resolveEmits(kind, data) as string[];
  const target = resolveAccepts(kind, data) as string[];
  for (const spec of resolveVisibleVerticalSockets(kind, data)) {
    if (spec.type === 'target' || spec.type === 'both') target.push(spec.id);
    if (spec.type === 'source') source.push(spec.id);
    // type=both 的上下口：入口 id=spec.id，出口 id=`${spec.id}-out`
    if (spec.type === 'both') source.push(`${spec.id}-out`);
  }
  return { source, target };
}

/** 展平单条模板的连线：同一次 build() 内解析 id → kind / data（模板 build 每次生成新 id） */
function linksOf(tpl: WorkflowTemplate): TemplateLinkView[] {
  const { blocks, links } = tpl.build();
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return links.map((link) => {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    const sourceData = source?.data as Record<string, unknown> | undefined;
    const targetData = target?.data as Record<string, unknown> | undefined;
    const sourceHandles = visibleHandles(source?.type ?? '', sourceData);
    const targetHandles = visibleHandles(target?.type ?? '', targetData);
    const sourceHandle = link.sourceHandle ?? null;
    const targetHandle = link.targetHandle ?? null;
    return {
      templateId: tpl.id,
      sourceId: link.source,
      targetId: link.target,
      sourceKind: source?.type ?? '<不存在>',
      targetKind: target?.type ?? '<不存在>',
      sourceHandle,
      targetHandle,
      legal: validateLink(
        source?.type ?? '',
        target?.type ?? '',
        sourceData,
        targetData,
      ),
      handlesResolved:
        (!sourceHandle || sourceHandles.source.includes(sourceHandle)) &&
        (!targetHandle || targetHandles.target.includes(targetHandle)),
    };
  });
}

function allLinks(): TemplateLinkView[] {
  return WORKFLOW_TEMPLATES.flatMap(linksOf);
}

function label(link: TemplateLinkView): string {
  return `${link.templateId}: ${link.sourceKind} → ${link.targetKind}`;
}

function isWhitelisted(link: TemplateLinkView): boolean {
  return ILLEGAL_LINK_WHITELIST.some(
    (w) => w.key === `${link.templateId}|${link.sourceKind} → ${link.targetKind}`,
  );
}

/** 未登记白名单、且未通过 validateLink 的连线 */
function illegalUnlistedLinks(): TemplateLinkView[] {
  return allLinks().filter((l) => !l.legal && !isWhitelisted(l));
}

describe('全量模板连线：口型合法性', () => {
  it('每一条 link 都通过 validateLink（含 asset-import / media-pin 等按 data 取口型）', () => {
    const illegal = illegalUnlistedLinks();
    expect(illegal.map(label), `存在 ${illegal.length} 条非法连线（kind）`).toEqual([]);
  });

  it('显式 handle 必须落在该节点真实口内（避免 RF 找不到 handle 的死边）', () => {
    const dangling = allLinks().filter((l) => !l.handlesResolved);
    expect(
      dangling.map((l) => `${label(l)} handle=${l.sourceHandle ?? '-'}/${l.targetHandle ?? '-'}`),
      '存在悬空 handle',
    ).toEqual([]);
  });

  it('12 条历史非法口型对在所有模板中均已消失', () => {
    const pairs = new Set(allLinks().map((l) => `${l.sourceKind} → ${l.targetKind}`));
    const regressed = REPAIRED_ILLEGAL_PAIRS.filter((p) => pairs.has(p));
    expect(regressed, '修复过的非法口型对重现').toEqual([]);
  });

  it('白名单不允许整体跳过：未登记即失败，登记项必须仍在命中且附原因', () => {
    for (const entry of ILLEGAL_LINK_WHITELIST) {
      expect(entry.reason.trim(), `${entry.key} 白名单条目缺原因`).not.toBe('');
    }
    const liveKeys = new Set(
      allLinks().map((l) => `${l.templateId}|${l.sourceKind} → ${l.targetKind}`),
    );
    const stale = ILLEGAL_LINK_WHITELIST.filter((w) => !liveKeys.has(w.key)).map((w) => w.key);
    expect(stale, '白名单条目已无对应连线，须删除').toEqual([]);
    // 命中白名单但已恢复合法的条目同样属于失效登记
    const nowLegal = ILLEGAL_LINK_WHITELIST.filter((w) =>
      allLinks().some(
        (l) =>
          `${l.templateId}|${l.sourceKind} → ${l.targetKind}` === w.key && l.legal,
      ),
    ).map((w) => w.key);
    expect(nowLegal, '白名单条目已恢复合法，须删除').toEqual([]);
  });
});

describe('全量模板连线：结构自洽', () => {
  it('edge 端点必须是本模板内真实节点 id，且无自环 / 无重复边 / 连线 id 唯一', () => {
    const problems: string[] = [];
    for (const tpl of WORKFLOW_TEMPLATES) {
      const { blocks, links } = tpl.build();
      const blockIds = new Set(blocks.map((b) => b.id));
      expect(blocks.length, `${tpl.id} 节点为空`).toBeGreaterThan(0);
      expect(new Set(blockIds).size, `${tpl.id} 节点 id 重复`).toBe(blockIds.size);

      const linkIds = links.map((l) => l.id);
      expect(new Set(linkIds).size, `${tpl.id} 连线 id 重复`).toBe(linkIds.length);

      const seen = new Set<string>();
      for (const link of links) {
        if (!blockIds.has(link.source)) problems.push(`${tpl.id} edge.source 非本模板节点：${link.source}`);
        if (!blockIds.has(link.target)) problems.push(`${tpl.id} edge.target 非本模板节点：${link.target}`);
        if (link.source === link.target) problems.push(`${tpl.id} 自环边：${link.source}`);
        const key = `${link.source}|${link.target}|${link.sourceHandle ?? ''}|${link.targetHandle ?? ''}`;
        if (seen.has(key)) problems.push(`${tpl.id} 重复边：${key}`);
        seen.add(key);
      }
    }
    expect(problems).toEqual([]);
  });

  it('没有节点以 asset-import 为下游（无入口口型 + 不渲染左侧 handle，必为死边）', () => {
    const dead = allLinks().filter((l) => l.targetKind === 'asset-import');
    expect(dead.map(label), 'asset-import 只能作为源（素材导入），不可作为图内下游').toEqual([]);
  });
});

describe('模板清单：数量与 id 集合基线', () => {
  it('模板数量与 id 集合与修复前基线一致（本次修复不增删模板、不改顺序）', () => {
    expect(WORKFLOW_TEMPLATES).toHaveLength(BASELINE_TEMPLATE_IDS.length);
    expect(WORKFLOW_TEMPLATES.map((t) => t.id)).toEqual([...BASELINE_TEMPLATE_IDS]);
  });

  it('模板 id 全局唯一', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('模板元数据仍齐备（本次修复不动 id/label/description/category/status）', () => {
    const CATEGORIES = ['video', 'image', 'story', 'tool'];
    const STATUSES = ['ga', 'beta', 'deprecated'];
    const problems: string[] = [];
    for (const tpl of WORKFLOW_TEMPLATES) {
      if (!tpl.label.trim()) problems.push(`${tpl.id} label 为空`);
      if (!tpl.description.trim()) problems.push(`${tpl.id} description 为空`);
      if (!CATEGORIES.includes(tpl.category)) problems.push(`${tpl.id} category 非法：${tpl.category}`);
      if (!STATUSES.includes(tpl.status)) problems.push(`${tpl.id} status 非法：${tpl.status}`);
    }
    expect(problems).toEqual([]);
  });
});
