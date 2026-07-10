import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSrc = readFileSync(join(root, 'packages/shared/src/catalog/block-catalog.ts'), 'utf8');

const chunks = catalogSrc.split(/\{\s*\n?\s*kind:/).slice(1);
const blocks = chunks.map((chunk) => {
  const kind = (chunk.match(/^ '([^']+)'/) || chunk.match(/^'([^']+)'/))?.[1];
  if (!kind) return null;
  const label = (chunk.match(/label:\s*'([^']*)'/) || [])[1] ?? kind;
  const category = (chunk.match(/category:\s*'([^']*)'/) || [])[1] ?? 'generate';
  const hint = (chunk.match(/hint:\s*'([^']*)'/) || [])[1] ?? '';
  return {
    kind,
    label,
    category,
    hint,
    deprecated: /deprecated:\s*true/.test(chunk),
    concealed: /concealed:\s*true/.test(chunk),
    nx9Native: /nx9Native:\s*true/.test(chunk),
  };
}).filter(Boolean);

const OUTPUT_KINDS = new Set([
  'preview-sink', 'mesh-viewer', 'thumbnail-maker', 'clip-sink', 'render-slot',
]);
const CONFIG_KINDS = new Set([
  'model-market', 'comfy-workflow', 'control-preprocess', 'color-grade', 'audio-mix',
  'export-pack', 'subtitle-burn', 'lipsync-pass', 'param-inject', 'director-3d',
  'blocking-stage', 'light-rig', 'depth-pass', 'panorama-sphere',
]);
const LOGIC_KINDS = new Set([
  'variant-fork', 'review-gate', 'recipe-spawn', 'prompt-diff', 'asset-watch', 'beat-sync',
  'bridge-clip', 'iterator', 'picker', 'passthrough', 'frame-endpoints', 'picture-diff',
  'grid-split', 'grid-compose', 'scale-fit', 'picture-merge', 'batch-runner',
]);
const AI_KINDS = new Set([
  'continuity-check', 'reference-analyze', 'seedance-chain', 'caption-asr',
  'grid-prompt-reverse', 'chat-model',
]);
const PROMPT_BAR_KINDS = new Set([
  'prompt', 'picture-gen', 'clip-gen', 'sound-gen', 'motion-story', 'photo-speak', 'music-gen',
  'inpaint-edit', 'chat-model', 'prompt-studio', 'style-lab', 'story-grid', 'grid-prompt-reverse',
  'scene-card', 'shot-script', 'director-desk', 'caption-asr', 'seedance-chain', 'bridge-clip',
  'thumbnail-maker',
]);
const PROMPT_BAR_GEN_KINDS = new Set([
  'picture-gen', 'clip-gen', 'sound-gen', 'motion-story', 'photo-speak', 'music-gen', 'inpaint-edit',
]);
const CATEGORY_DEFAULT = {
  source: 'input', generate: 'input', craft: 'input', hub: 'logic',
  integrate: 'config', utility: 'logic', support: 'output', spatial: 'config',
};

function resolveClass(kind, category) {
  if (OUTPUT_KINDS.has(kind)) return 'output';
  if (CONFIG_KINDS.has(kind)) return 'config';
  if (LOGIC_KINDS.has(kind)) return 'logic';
  if (AI_KINDS.has(kind)) return 'ai';
  if (category === 'source' && kind.includes('preview')) return 'output';
  return CATEGORY_DEFAULT[category] ?? 'input';
}

const CATEGORY_LABEL = {
  source: '素材 source', generate: '生成 generate', craft: '创作 craft', hub: 'Hub hub',
  integrate: '集成 integrate', utility: '工具 utility', support: '辅助 support', spatial: '空间 spatial',
};
const CLASS_LABEL = {
  input: '输入型', config: '配置型', logic: '逻辑型', output: '输出型', ai: 'AI 型',
};

const rows = blocks.map((b) => {
  const interactionClass = resolveClass(b.kind, b.category);
  const promptBar = PROMPT_BAR_KINDS.has(b.kind);
  const genFooter = PROMPT_BAR_GEN_KINDS.has(b.kind);
  const canvasUi = promptBar ? '紧凑卡片 + 跟随 Prompt Bar' : '完整节点（探索常开 / 生产可折叠）';
  return { ...b, interactionClass, promptBar, genFooter, canvasUi };
});

const byCategory = {};
for (const r of rows) (byCategory[r.category] ??= []).push(r);

const spawnable = rows.filter((r) => !r.deprecated);

let md = `# NX9 节点交互分类总表

> 生成自 \`block-catalog.ts\`（${rows.length} kind）+ \`node-interaction.ts\`  
> 路径：\`docs/NX9-NODE-INTERACTION-REGISTRY.md\`

## 当前代码行为

| 条件 | 画布 | 选中后 |
|------|------|--------|
| kind ∈ \`PROMPT_BAR_KINDS\`（${rows.filter((r) => r.promptBar).length}） | 紧凑卡片 | 节点下方 **Prompt Bar** + Inspector |
| 其他 kind（${rows.filter((r) => !r.promptBar).length}） | **完整 Block UI** | 仅 Inspector（生产模式可双击展开） |

---

## 一、Prompt Bar 白名单

| # | kind | 中文名 | catalog 分类 | 交互类型 | 生成参数底栏 |
|---|------|--------|-------------|----------|-------------|
`;

rows.filter((r) => r.promptBar).sort((a, b) => a.kind.localeCompare(b.kind)).forEach((r, i) => {
  md += `| ${i + 1} | \`${r.kind}\` | ${r.label} | ${r.category} | ${CLASS_LABEL[r.interactionClass]} | ${r.genFooter ? '✅' : '—'} |\n`;
});

md += `\n---\n\n## 二、非 Prompt Bar（完整原节点 UI）\n\n`;
md += `### 2.1 可_spawn 节点（${spawnable.filter((r) => !r.promptBar).length}）\n\n`;
md += `| # | kind | 中文名 | catalog 分类 | 交互类型 | 隐藏 |\n|---|------|--------|-------------|----------|------|\n`;
spawnable.filter((r) => !r.promptBar).sort((a, b) => a.kind.localeCompare(b.kind)).forEach((r, i) => {
  md += `| ${i + 1} | \`${r.kind}\` | ${r.label} | ${r.category} | ${CLASS_LABEL[r.interactionClass]} | ${r.concealed ? '是' : ''} |\n`;
});

md += `\n### 2.2 已废弃（deprecated，${rows.filter((r) => r.deprecated).length}）\n\n`;
md += `| kind | 中文名 | Prompt Bar |\n|------|--------|------------|\n`;
rows.filter((r) => r.deprecated).sort((a, b) => a.kind.localeCompare(b.kind)).forEach((r) => {
  md += `| \`${r.kind}\` | ${r.label} | ${r.promptBar ? '✅' : '❌'} |\n`;
});

md += `\n---\n\n## 三、全量 100 节点（按 catalog 分类）\n\n`;
for (const cat of Object.keys(CATEGORY_LABEL)) {
  const items = byCategory[cat];
  if (!items?.length) continue;
  md += `### ${CATEGORY_LABEL[cat]}（${items.length}）\n\n`;
  md += `| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |\n|------|--------|----------|------------|---------|------|------|------|\n`;
  for (const r of items.sort((a, b) => a.kind.localeCompare(b.kind))) {
    md += `| \`${r.kind}\` | ${r.label} | ${CLASS_LABEL[r.interactionClass]} | ${r.promptBar ? '✅' : '❌'} | ${r.canvasUi} | ${r.deprecated ? '是' : ''} | ${r.concealed ? '是' : ''} | ${r.hint.replace(/\|/g, '\\|').slice(0, 36)} |\n`;
  }
  md += `\n`;
}

md += `---\n\n## 四、待确认：分类冲突\n\n`;
md += `### 在白名单但非「输入型」（可能不应有 Prompt Bar）\n\n`;
md += `| kind | 中文名 | 实际交互类型 |\n|------|--------|-------------|\n`;
for (const r of rows.filter((r) => r.promptBar && r.interactionClass !== 'input')) {
  md += `| \`${r.kind}\` | ${r.label} | ${CLASS_LABEL[r.interactionClass]} |\n`;
}

md += `\n### 输入型/AI 型但不在白名单（当前用完整 UI）\n\n`;
md += `| kind | 中文名 | 交互类型 | hint |\n|------|--------|----------|------|\n`;
for (const r of spawnable.filter((r) => !r.promptBar && (r.interactionClass === 'input' || r.interactionClass === 'ai'))) {
  md += `| \`${r.kind}\` | ${r.label} | ${CLASS_LABEL[r.interactionClass]} | ${r.hint.slice(0, 40)} |\n`;
}

md += `\n---\n\n## 五、修改方式\n\n`;
md += `1. 调整 Prompt Bar 白名单：\`packages/shared/src/catalog/node-interaction.ts\` → \`PROMPT_BAR_KINDS\`\n`;
md += `2. 重新生成本文档：\`node scripts/gen-node-interaction-doc.mjs\`\n`;
md += `3. 画布渲染逻辑：\`apps/web/src/engine/stage-deck/canvas/stage-deck-node-types.tsx\`（\`isPromptBarKind\`）\n`;

writeFileSync(join(root, 'docs/NX9-NODE-INTERACTION-REGISTRY.md'), md, 'utf8');
console.log(`OK: ${rows.length} nodes`);
