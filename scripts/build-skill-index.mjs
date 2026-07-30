/**
 * Build skill-index.json from skills/ directory.
 *
 * Usage: node scripts/build-skill-index.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROOT, 'skills');
const INDEX_PATH = join(ROOT, 'skill-index.json');

function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

function readFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function main() {
  if (!existsSync(SKILLS_DIR)) {
    writeFileSync(INDEX_PATH, '[]', 'utf-8');
    console.log('skills/ 目录不存在，写入空索引');
    return;
  }

  const out = [];

  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const skillMd = join(SKILLS_DIR, name, 'SKILL.md');
    if (!existsSync(skillMd)) continue;

    const content = readFileSync(skillMd, 'utf-8');
    const fm = readFrontmatter(content);
    const meta = readJsonSafe(join(SKILLS_DIR, name, 'metadata.json'));

    out.push({
      id: name,
      name: fm.name || meta?.title || name,
      description: fm.description || meta?.description || '',
      version: meta?.version,
      status: meta?.status || 'draft',
      tags: meta?.tags || [],
      promptId: meta?.nx9?.promptId,
      category: meta?.nx9?.category,
      priority: meta?.nx9?.priority,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(INDEX_PATH, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`生成 skill-index.json：${out.length} 个 Skill`);
}

main();
