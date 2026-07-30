import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, relative, resolve } from 'path';
import type { SkillDetail, SkillMetadata, SkillSummary, SkillValidationResult } from '@nx9/shared';
import {
  BUILTIN_GEN_SKILL_IDS,
  isSkillStubContent,
  parseGenPromptPack,
  resolveSkillLane,
  skillBodyForInjection,
  type GenPromptPack,
} from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { SEED_SKILLS, type SeedSkill } from './seed-skills';
import { SEEDANCE_SKILLS } from './seedance-skills';

const ID_PATTERN = /^[a-z0-9-]+$/;

const KNOWN_SECTIONS = [
  '这个 skill 用来做什么',
  '输入要求',
  '输出要求',
  '工作流程',
  '约束与边界',
  '示例',
  '检查清单',
];

function tryReadMetadata(skillId: string): SkillMetadata | undefined {
  try {
    const metaPath = join(PATHS.skills, skillId, 'metadata.json');
    if (!existsSync(metaPath)) return undefined;
    const raw = readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw) as SkillMetadata;
  } catch {
    return undefined;
  }
}

function readYamlFrontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function validateSkill(skillId: string): SkillValidationResult {
  const errors: { file: string; message: string }[] = [];
  const dir = join(PATHS.skills, skillId);

  if (!existsSync(dir)) {
    errors.push({ file: skillId, message: 'Skill directory not found' });
    return { valid: false, errors };
  }

  const meta = tryReadMetadata(skillId);
  if (!meta) {
    errors.push({ file: 'metadata.json', message: 'metadata.json 缺失' });
  } else {
    if (!meta.name || meta.name !== skillId) {
      errors.push({ file: 'metadata.json', message: 'name 必须与目录名一致' });
    }
    if (!meta.title) errors.push({ file: 'metadata.json', message: 'title 缺失' });
    if (!meta.description || meta.description.length < 5) {
      errors.push({ file: 'metadata.json', message: 'description 缺失或过短（需 ≥20 字）' });
    }
    if (!meta.version) errors.push({ file: 'metadata.json', message: 'version 缺失' });
    if (!meta.entry) {
      errors.push({ file: 'metadata.json', message: 'entry 缺失' });
    } else if (!existsSync(join(dir, meta.entry))) {
      errors.push({ file: 'metadata.json', message: `entry 文件 ${meta.entry} 不存在` });
    }
    if (meta.status && !['draft', 'stable', 'deprecated'].includes(meta.status)) {
      errors.push({ file: 'metadata.json', message: 'status 必须为 draft|stable|deprecated' });
    }
    if (meta.resources) {
      for (const [key, path] of Object.entries(meta.resources)) {
        if (!existsSync(join(dir, path))) {
          errors.push({ file: 'metadata.json', message: `resources.${key} 路径 ${path} 不存在` });
        }
      }
    }
  }

  const entryPath = meta?.entry ? join(dir, meta.entry) : join(dir, 'SKILL.md');
  if (existsSync(entryPath)) {
    const raw = readFileSync(entryPath, 'utf-8');
    const fm = readYamlFrontmatter(raw);
    if (!fm.name) errors.push({ file: meta?.entry ?? 'SKILL.md', message: 'frontmatter 缺少 name' });
    if (!fm.description) errors.push({ file: meta?.entry ?? 'SKILL.md', message: 'frontmatter 缺少 description' });

    if (meta) {
      if (fm.name && meta.title && fm.name !== meta.title) {
        errors.push({ file: meta.entry, message: 'frontmatter name 与 metadata.json title 不一致' });
      }
      if (fm.description && meta.description && fm.description !== meta.description) {
        errors.push({ file: meta.entry, message: 'frontmatter description 与 metadata.json description 不一致' });
      }
    }

    for (const section of KNOWN_SECTIONS) {
      if (!raw.includes(section)) {
        errors.push({ file: meta?.entry ?? 'SKILL.md', message: `缺少强制章节：${section}` });
      }
    }
  } else {
    errors.push({ file: meta?.entry ?? 'SKILL.md', message: 'SKILL.md 不存在' });
  }

  if (!existsSync(join(dir, 'examples'))) {
    errors.push({ file: 'examples/', message: 'examples/ 目录缺失' });
  } else {
    if (!existsSync(join(dir, 'examples', 'input.md'))) {
      errors.push({ file: 'examples/input.md', message: 'examples/input.md 缺失' });
    }
    if (!existsSync(join(dir, 'examples', 'output.md'))) {
      errors.push({ file: 'examples/output.md', message: 'examples/output.md 缺失' });
    }
  }

  for (const reqDir of ['references', 'templates', 'tests'] as const) {
    const p = join(dir, reqDir);
    if (!existsSync(p) || !statSync(p).isDirectory()) {
      errors.push({ file: `${reqDir}/`, message: `${reqDir}/ 目录缺失（模板强制）` });
    } else {
      const files = readdirSync(p).filter((f) => !f.startsWith('.'));
      if (files.length === 0) {
        errors.push({ file: `${reqDir}/`, message: `${reqDir}/ 为空（至少 1 个文件）` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

@Injectable()
export class SkillsService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    if (!existsSync(PATHS.skills)) mkdirSync(PATHS.skills, { recursive: true });
    for (const seed of [...SEED_SKILLS, ...SEEDANCE_SKILLS]) {
      this.seedSkill(seed);
    }
    this.buildIndex();
  }

  private seedSkill(seed: SeedSkill): void {
    const dir = join(PATHS.skills, seed.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (seed.metadata) {
      const metaFile = join(dir, 'metadata.json');
      if (!existsSync(metaFile)) {
        writeFileSync(metaFile, JSON.stringify(seed.metadata, null, 2), 'utf-8');
      }
    }

    const entryFile = join(dir, seed.metadata?.entry || 'SKILL.md');
    if (!existsSync(entryFile)) {
      writeFileSync(entryFile, seed.content, 'utf-8');
    }

    if (!existsSync(join(dir, 'examples'))) {
      mkdirSync(join(dir, 'examples'), { recursive: true });
      writeFileSync(join(dir, 'examples', 'input.md'), `# ${seed.metadata?.title ?? seed.id} 输入示例\n\n（待补充）\n`, 'utf-8');
      writeFileSync(join(dir, 'examples', 'output.md'), `# ${seed.metadata?.title ?? seed.id} 输出示例\n\n（待补充）\n`, 'utf-8');
    }

    if (!existsSync(join(dir, 'references'))) {
      mkdirSync(join(dir, 'references'), { recursive: true });
    }
  }

  seedSeedance(): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;
    for (const seed of SEEDANCE_SKILLS) {
      const dir = join(PATHS.skills, seed.id);
      if (existsSync(join(dir, 'SKILL.md')) || existsSync(join(dir, 'metadata.json'))) {
        skipped++;
        continue;
      }
      this.seedSkill(seed);
      imported++;
    }
    if (imported > 0) this.buildIndex();
    return { imported, skipped };
  }

  private skillDir(id: string): string {
    if (!ID_PATTERN.test(id)) {
      throw new BadRequestException('Skill id 只能包含 a-z、0-9 和短横线');
    }
    return join(PATHS.skills, id);
  }

  private resolveEntryPath(id: string): string {
    const dir = this.skillDir(id);
    const meta = tryReadMetadata(id);
    const entry = meta?.entry || 'SKILL.md';
    return join(dir, entry);
  }

  private assertSkillExists(id: string): string {
    const dir = this.skillDir(id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new NotFoundException(`Skill ${id} 不存在`);
    }
    const entryPath = this.resolveEntryPath(id);
    if (!existsSync(entryPath)) {
      throw new NotFoundException(`Skill ${id} 的入口文件不存在`);
    }
    return entryPath;
  }

  list(): SkillSummary[] {
    if (!existsSync(PATHS.skills)) return [];
    const out: SkillSummary[] = [];
    for (const entry of readdirSync(PATHS.skills, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = join(PATHS.skills, entry.name);
      const searchFile = join(sub, 'SKILL.md');
      if (!existsSync(searchFile)) continue;
      const content = readFileSync(searchFile, 'utf-8');
      const fm = readYamlFrontmatter(content);
      const meta = tryReadMetadata(entry.name);
      out.push({
        id: entry.name,
        name: fm.name || meta?.title || entry.name,
        description: fm.description || meta?.description || '',
        version: meta?.version,
        status: meta?.status,
        tags: meta?.tags,
        promptId: meta?.nx9?.promptId,
        category: meta?.nx9?.category,
        priority: meta?.nx9?.priority,
        lane: resolveSkillLane(entry.name, meta?.nx9?.lane),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(id: string): SkillDetail {
    const entryPath = this.assertSkillExists(id);
    const content = readFileSync(entryPath, 'utf-8');
    const fm = readYamlFrontmatter(content);
    const meta = tryReadMetadata(id);

    const files: { name: string; content: string }[] = [];
    const dir = join(PATHS.skills, id);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name !== 'SKILL.md' && entry.name !== 'metadata.json' && entry.name.endsWith('.md')) {
        const fpath = join(dir, entry.name);
        if (statSync(fpath).size < 1024 * 100) {
          files.push({ name: entry.name, content: readFileSync(fpath, 'utf-8') });
        }
      }
    }

    return {
      id,
      name: fm.name || meta?.title || id,
      description: fm.description || meta?.description || '',
      version: meta?.version,
      status: meta?.status,
      tags: meta?.tags,
      promptId: meta?.nx9?.promptId,
      category: meta?.nx9?.category,
      priority: meta?.nx9?.priority,
      lane: resolveSkillLane(id, meta?.nx9?.lane),
      content,
      metadata: meta,
      files: files.length > 0 ? files : undefined,
    };
  }

  create(input: { id: string; name?: string; description?: string }): SkillSummary {
    const id = input.id.trim();
    const dir = this.skillDir(id);
    if (existsSync(dir)) throw new BadRequestException('Skill 已存在');
    mkdirSync(dir, { recursive: true });
    const title = (input.name ?? id).trim();
    const description = (input.description ?? '').trim();
    const content = `---
name: ${title}
description: ${description}
---

# ${title}

## 这个 skill 用来做什么

${description}

## 输入要求

（待补充）

## 输出要求

（待补充）

## 工作流程

（待补充）

## 约束与边界

（待补充）

## 示例

参见 examples/

## 检查清单

- [ ] 输入格式正确
- [ ] 输出符合契约
`;
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
    const metadata: SkillMetadata = {
      name: id,
      title,
      description,
      version: '0.1.0',
      entry: 'SKILL.md',
      author: 'nx9',
      status: 'draft',
      tags: [],
    };
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
    mkdirSync(join(dir, 'examples'), { recursive: true });
    writeFileSync(join(dir, 'examples', 'input.md'), `# ${title} 输入示例\n\n（待补充）\n`, 'utf-8');
    writeFileSync(join(dir, 'examples', 'output.md'), `# ${title} 输出示例\n\n（待补充）\n`, 'utf-8');
    mkdirSync(join(dir, 'references'), { recursive: true });
    this.buildIndex();
    return { id, name: title, description, version: '0.1.0', status: 'draft', tags: [] };
  }

  update(id: string, body: { content?: string; metadata?: Partial<SkillMetadata> }): void {
    const entryPath = this.assertSkillExists(id);
    if (body.content !== undefined) {
      writeFileSync(entryPath, body.content, 'utf-8');
    }
    if (body.metadata) {
      const dir = this.skillDir(id);
      const metaFile = join(dir, 'metadata.json');
      const current = tryReadMetadata(id) ?? {
        name: id,
        title: id,
        description: '',
        version: '0.1.0',
        entry: 'SKILL.md',
      };
      const merged = { ...current, ...body.metadata, updated_at: new Date().toISOString() };
      writeFileSync(metaFile, JSON.stringify(merged, null, 2), 'utf-8');
    }
    this.buildIndex();
  }

  writeFile(id: string, filePath: string, content: string): void {
    this.assertSkillExists(id);
    const dir = this.skillDir(id);
    const resolved = resolve(dir, filePath.replace(/\\/g, '/'));
    if (!resolved.startsWith(resolve(dir))) {
      throw new BadRequestException('路径不可超出 Skill 目录');
    }
    const parent = join(resolved, '..');
    if (!existsSync(parent)) mkdirSync(resolve(parent), { recursive: true });
    writeFileSync(resolved, content, 'utf-8');
  }

  readFile(id: string, filePath: string): string {
    this.assertSkillExists(id);
    const dir = this.skillDir(id);
    const resolved = resolve(dir, filePath.replace(/\\/g, '/'));
    if (!resolved.startsWith(resolve(dir))) {
      throw new BadRequestException('路径不可超出 Skill 目录');
    }
    if (!existsSync(resolved)) throw new NotFoundException('文件不存在');
    return readFileSync(resolved, 'utf-8');
  }

  listFiles(id: string): string[] {
    this.assertSkillExists(id);
    const dir = this.skillDir(id);
    const out: string[] = [];
    const scan = (current: string, prefix: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          scan(join(current, entry.name), rel);
        } else {
          out.push(rel);
        }
      }
    };
    scan(dir, '');
    return out.sort();
  }

  remove(id: string): void {
    const dir = this.skillDir(id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new NotFoundException('Skill 不存在');
    }
    rmSync(dir, { recursive: true, force: true });
    this.buildIndex();
  }

  validate(id: string): SkillValidationResult {
    return validateSkill(id);
  }

  reset(id: string): void {
    const dir = this.skillDir(id);
    if (!existsSync(dir)) throw new NotFoundException('Skill 不存在');

    const allSeeds = [...SEED_SKILLS, ...SEEDANCE_SKILLS];
    const seed = allSeeds.find((s) => s.id === id);
    if (!seed) {
      throw new BadRequestException(
        '该 Skill 无 seed 快照可重置。官方包以 skills/ 磁盘为准，请用 git 还原或运行 node scripts/generate-builtin-skills.mjs',
      );
    }

    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.seedSkill(seed);
    this.buildIndex();
  }

  buildIndex(): void {
    const skills = this.list();
    const indexPath = join(PATHS.skills, '..', 'skill-index.json');
    writeFileSync(indexPath, JSON.stringify(skills, null, 2), 'utf-8');
  }

  getIndex(): SkillSummary[] {
    const indexPath = join(PATHS.skills, '..', 'skill-index.json');
    if (!existsSync(indexPath)) {
      this.buildIndex();
    }
    try {
      return JSON.parse(readFileSync(indexPath, 'utf-8')) as SkillSummary[];
    } catch {
      return this.list();
    }
  }

  /**
   * 运行时注入用：读独立 Skill 项目 entry，去掉 frontmatter。
   * 与设置页保存共用同一磁盘路径，保证「改 A 跑 A」。
   */
  getSystemPrompt(skillName: string): string {
    const entryPath = this.assertSkillExists(skillName);
    const raw = readFileSync(entryPath, 'utf-8');
    const body = skillBodyForInjection(raw);
    if (!body) {
      throw new NotFoundException(`Skill ${skillName} 正文为空`);
    }
    return body;
  }

  /**
   * Gen Template 拼装包：读 skills/<id>/templates/prompt-pack.md。
   * 拼装器优先用此包；缺失时返回空包，由 shared builder 走 legacy 兜底。
   */
  getGenPack(skillName: string): GenPromptPack {
    this.assertSkillExists(skillName);
    const packPath = join(PATHS.skills, skillName, 'templates', 'prompt-pack.md');
    if (!existsSync(packPath)) {
      return { skillId: skillName };
    }
    const raw = readFileSync(packPath, 'utf-8');
    return parseGenPromptPack(skillName, raw);
  }

  /** 批量拉取内置 Gen 拼装包（前端缓存用） */
  listGenPacks(ids?: string[]): GenPromptPack[] {
    const list = ids?.length ? ids : [...BUILTIN_GEN_SKILL_IDS];
    const out: GenPromptPack[] = [];
    for (const id of list) {
      try {
        out.push(this.getGenPack(id));
      } catch {
        out.push({ skillId: id });
      }
    }
    return out;
  }

  /**
   * 优先用 Skill 项目正文；骨架占位或缺失时回退 legacy（并保留 Skill 前缀提示）。
   * legacy 仅作防崩溃兼容，不得再作为长期权威源。
   */
  resolveSystemPrompt(skillName: string, legacyFallback?: string): string {
    try {
      const body = this.getSystemPrompt(skillName);
      if (!isSkillStubContent(body)) return body;
      if (legacyFallback?.trim()) {
        return [
          body,
          '',
          '## 运行时兼容契约（Skill 正文尚未加厚，以下为临时补充，编辑设置→技能可覆盖）',
          legacyFallback.trim(),
        ].join('\n');
      }
      return body;
    } catch {
      const fb = legacyFallback?.trim();
      if (fb) return fb;
      throw new NotFoundException(`Skill ${skillName} 不可用且无兜底契约`);
    }
  }
}
