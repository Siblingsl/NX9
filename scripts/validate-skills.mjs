/**
 * Skills validator — checks every skills/<name>/ directory against
 * the NX9 skill project spec (§1.5).
 *
 * Usage: node scripts/validate-skills.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
// statSync used for directory checks
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROOT, 'skills');

const KNOWN_SECTIONS = [
  '这个 skill 用来做什么',
  '输入要求',
  '输出要求',
  '工作流程',
  '约束与边界',
  '示例',
  '检查清单',
];

const ALIAS_SECTIONS = [
  '目标', '说明', '输入', '输出', '输出格式', '原则', '规则', '任务',
  '格式', '格式规则', '改写原则', '分幕原则', '改编原则',
  '规划原则', '拆解原则', '提示词要求', '注意', '硬规则',
  '判断维度', '范例', '首镜定调', '五段顺序', '续拍指南',
  '上限提醒', '禁止',
];

function readJsonSafe(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

function validateMetadata(name, errors) {
  const metaPath = join(SKILLS_DIR, name, 'metadata.json');
  if (!existsSync(metaPath)) {
    errors.push({ file: `${name}/metadata.json`, message: 'metadata.json 缺失' });
    return null;
  }
  const meta = readJsonSafe(metaPath);
  if (!meta) {
    errors.push({ file: `${name}/metadata.json`, message: '非法 JSON' });
    return null;
  }
  if (!meta.name || meta.name !== name) {
    errors.push({ file: `${name}/metadata.json`, message: 'name 字段必须与目录名一致' });
  }
  if (!meta.title) errors.push({ file: `${name}/metadata.json`, message: 'title 缺失' });
  if (!meta.description || meta.description.length < 5) {
    errors.push({ file: `${name}/metadata.json`, message: 'description 缺失或过短（需 ≥20 字）' });
  }
  if (!meta.version) errors.push({ file: `${name}/metadata.json`, message: 'version 缺失' });
  if (!meta.entry) {
    errors.push({ file: `${name}/metadata.json`, message: 'entry 缺失' });
  } else if (!existsSync(join(SKILLS_DIR, name, meta.entry))) {
    errors.push({ file: `${name}/metadata.json`, message: `entry 文件 ${meta.entry} 不存在` });
  }
  if (meta.status && !['draft', 'stable', 'deprecated'].includes(meta.status)) {
    errors.push({ file: `${name}/metadata.json`, message: 'status 必须为 draft|stable|deprecated' });
  }
  if (meta.resources) {
    for (const [key, path] of Object.entries(meta.resources)) {
      if (!existsSync(join(SKILLS_DIR, name, path))) {
        errors.push({ file: `${name}/metadata.json`, message: `resources.${key} 路径 ${path} 不存在` });
      }
    }
  }
  return meta;
}

function validateSkillMd(name, meta, errors) {
  const entryPath = join(SKILLS_DIR, name, meta?.entry || 'SKILL.md');
  if (!existsSync(entryPath)) {
    errors.push({ file: `${name}/SKILL.md`, message: 'SKILL.md 不存在' });
    return;
  }
  const raw = readFileSync(entryPath, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    errors.push({ file: `${name}/SKILL.md`, message: '缺少 YAML frontmatter' });
  } else {
    const fmLines = fmMatch[1].split('\n');
    const hasName = fmLines.some((l) => l.startsWith('name:'));
    const hasDesc = fmLines.some((l) => l.startsWith('description:'));
    if (!hasName) errors.push({ file: `${name}/SKILL.md`, message: 'frontmatter 缺少 name' });
    if (!hasDesc) errors.push({ file: `${name}/SKILL.md`, message: 'frontmatter 缺少 description' });
  }

  let foundSections = 0;
  const allSections = [...KNOWN_SECTIONS, ...ALIAS_SECTIONS];
  for (const section of allSections) {
    if (raw.includes(section)) foundSections++;
  }
  if (foundSections < 3) {
    errors.push({ file: `${name}/SKILL.md`, message: `章节不完整（至少需要 3 个规定章节，当前 ${foundSections}）` });
  }
}

function main() {
  if (!existsSync(SKILLS_DIR)) {
    console.log('skills/ 目录不存在，跳过校验');
    process.exit(0);
  }

  let totalErrors = 0;
  let passed = 0;
  let failed = 0;

  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const errors = [];

    const meta = validateMetadata(name, errors);

    if (!existsSync(join(SKILLS_DIR, name, 'SKILL.md'))) {
      errors.push({ file: `${name}/SKILL.md`, message: 'SKILL.md 不存在' });
    } else {
      validateSkillMd(name, meta, errors);
    }

    if (!existsSync(join(SKILLS_DIR, name, 'examples'))) {
      errors.push({ file: `${name}/examples/`, message: 'examples/ 目录缺失' });
    } else {
      if (!existsSync(join(SKILLS_DIR, name, 'examples', 'input.md'))) {
        errors.push({ file: `${name}/examples/input.md`, message: 'examples/input.md 缺失' });
      }
      if (!existsSync(join(SKILLS_DIR, name, 'examples', 'output.md'))) {
        errors.push({ file: `${name}/examples/output.md`, message: 'examples/output.md 缺失' });
      }
    }

    for (const reqDir of ['references', 'templates', 'tests']) {
      const p = join(SKILLS_DIR, name, reqDir);
      if (!existsSync(p) || !statSync(p).isDirectory()) {
        errors.push({ file: `${name}/${reqDir}/`, message: `${reqDir}/ 目录缺失（模板强制）` });
      } else {
        const files = readdirSync(p).filter((f) => !f.startsWith('.'));
        if (files.length === 0) {
          errors.push({ file: `${name}/${reqDir}/`, message: `${reqDir}/ 为空（至少 1 个文件）` });
        }
      }
    }

    // 九段标题：必须齐（不用别名凑数）
    const entryPath = join(SKILLS_DIR, name, meta?.entry || 'SKILL.md');
    if (existsSync(entryPath)) {
      const raw = readFileSync(entryPath, 'utf-8');
      for (const section of KNOWN_SECTIONS) {
        if (!raw.includes(section)) {
          errors.push({ file: `${name}/SKILL.md`, message: `缺少强制章节：${section}` });
        }
      }
    }

    if (errors.length === 0) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      for (const e of errors) {
        console.log(`    ${e.file}: ${e.message}`);
      }
      totalErrors += errors.length;
      failed++;
    }
  }

  console.log(`\n${passed} 通过, ${failed} 失败, ${totalErrors} 个错误`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
