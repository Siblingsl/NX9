import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsPath = path.join(process.env.TEMP || '/tmp', 'fcml.js');
const js = fs.readFileSync(jsPath, 'utf8');

const marker = 'JSON.parse(\'[';
const start = js.indexOf(marker);
if (start < 0) {
  console.error('Could not find JSON.parse payload');
  process.exit(1);
}

// The payload is a single-quoted JS string containing JSON with escaped quotes.
// Find matching end: ']) or '); depending on minify style.
let i = start + 'JSON.parse('.length; // points at opening '
if (js[i] !== "'") {
  console.error('Expected single-quoted JSON.parse argument');
  process.exit(1);
}
i += 1; // after opening quote
let raw = '';
while (i < js.length) {
  const c = js[i];
  if (c === '\\') {
    raw += c + (js[i + 1] ?? '');
    i += 2;
    continue;
  }
  if (c === "'") break;
  raw += c;
  i += 1;
}

// Inside single-quoted string, \" is literal quote for JSON
const jsonText = raw
  .replace(/\\'/g, "'")
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, '\\');

let systems;
try {
  systems = JSON.parse(jsonText);
} catch (err) {
  // Fallback: the minify may use \' less; try eval-safe JSON.parse of the raw with standard unescape
  try {
    systems = JSON.parse(raw.replace(/\\"/g, '"'));
  } catch (err2) {
    console.error('JSON parse failed:', err.message);
    console.error('fallback failed:', err2.message);
    console.error('raw head:', raw.slice(0, 200));
    process.exit(1);
  }
}

if (!Array.isArray(systems)) {
  console.error('Expected systems array, got', typeof systems);
  process.exit(1);
}

const categories = [];
for (const system of systems) {
  for (const cat of system.categories || []) {
    categories.push({
      id: cat.id,
      name: cat.name,
      systemId: system.id,
      system: system.name,
      systemDescription: system.description || '',
      scene: cat.description || '',
      items: (cat.items || []).map((item) => ({
        id: item.id,
        name: item.name,
        logic: item.logic || '',
        effect: item.effect || '',
        prompt: item.prompt || '',
      })),
    });
  }
}

const shotCount = categories.reduce((n, c) => n + c.items.length, 0);
console.log('systems:', systems.length);
console.log('categories:', categories.length);
console.log('shots:', shotCount);
for (const c of categories) {
  console.log(`- [${c.systemId}] ${c.name}: ${c.items.length}`);
}

const scrapedAt = new Date().toISOString();
const outJson = path.join(root, 'docs', 'fcml-yunjing-prompts.json');
const outMd = path.join(root, 'docs', 'fcml-yunjing-prompts.md');

fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      source: 'https://fcml.infission.com/',
      scrapedAt,
      systemCount: systems.length,
      categoryCount: categories.length,
      shotCount,
      systems: systems.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        categories: (s.categories || []).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          items: c.items,
        })),
      })),
    },
    null,
    2,
  ),
  'utf8',
);

const lines = [];
lines.push('# 运镜全库提示词归档');
lines.push('');
lines.push(`> 来源：[https://fcml.infission.com/](https://fcml.infission.com/)`);
lines.push(`> 抓取时间：${scrapedAt}`);
lines.push(
  `> 共 **${systems.length}** 个体系、**${categories.length}** 个分类、**${shotCount}** 种运镜`,
);
lines.push('');
lines.push('## 目录结构');
lines.push('');
lines.push('| 体系 | 分类 | 数量 |');
lines.push('| --- | --- | ---: |');
for (const c of categories) {
  lines.push(`| ${c.system} | ${c.name} | ${c.items.length} |`);
}
lines.push('');
lines.push('字段说明：');
lines.push('- **镜头名称**：运镜名称');
lines.push('- **类型**：体系 / 分类');
lines.push('- **核心逻辑 / 核心作用**：站点卡片摘要');
lines.push('- **完整 AI 生成提示词**：站点「完整 AI 生成提示词」原文');
lines.push('');

let n = 0;
let currentSystem = '';
for (const cat of categories) {
  if (cat.system !== currentSystem) {
    currentSystem = cat.system;
    lines.push('---');
    lines.push('');
    lines.push(`# ${currentSystem}`);
    lines.push('');
    if (cat.systemDescription) {
      lines.push(cat.systemDescription);
      lines.push('');
    }
  }

  lines.push(`## ${cat.name}`);
  lines.push('');
  lines.push(`- 分类 ID：\`${cat.id}\``);
  lines.push(`- 条目数：${cat.items.length}`);
  if (cat.scene) lines.push(`- 固定场景：${cat.scene}`);
  lines.push('');

  for (const item of cat.items) {
    n += 1;
    lines.push(`### ${n}. ${item.name}`);
    lines.push('');
    lines.push(`- ID：\`${item.id}\``);
    lines.push(`- 类型：${cat.system} / ${cat.name}`);
    if (item.logic) lines.push(`- 核心逻辑：${item.logic}`);
    if (item.effect) lines.push(`- 核心作用：${item.effect}`);
    lines.push('');
    lines.push('**完整 AI 生成提示词**');
    lines.push('');
    lines.push('```');
    lines.push(item.prompt);
    lines.push('```');
    lines.push('');
  }
}

fs.writeFileSync(outMd, lines.join('\n'), 'utf8');
console.log('wrote', outMd);
console.log('wrote', outJson);

// Flat CSV-ish TSV for easier import later
const outTsv = path.join(root, 'docs', 'fcml-yunjing-prompts.tsv');
const tsv = ['id\tname\tsystem\tcategory\tlogic\teffect\tprompt'];
for (const cat of categories) {
  for (const item of cat.items) {
    const esc = (s) => String(s ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    tsv.push(
      [
        item.id,
        esc(item.name),
        esc(cat.system),
        esc(cat.name),
        esc(item.logic),
        esc(item.effect),
        esc(item.prompt),
      ].join('\t'),
    );
  }
}
fs.writeFileSync(outTsv, tsv.join('\n'), 'utf8');
console.log('wrote', outTsv);
