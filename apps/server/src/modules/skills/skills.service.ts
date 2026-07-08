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
import { join } from 'path';
import type { SkillDetail, SkillSummary } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { SEED_SKILLS } from './seed-skills';
import { SEEDANCE_SKILLS } from './seedance-skills';

const ID_PATTERN = /^[a-z0-9-]+$/;
const FRONTMATTER_NAME = /^name:\s*(.+)$/m;
const FRONTMATTER_DESC = /^description:\s*(.+)$/m;

/**
 * Manages SKILL.md files under PATHS.skills.
 *
 * Skills are instruction files (agent-skills / OpenMontage model):
 * when a user picks a skill in the ChatModel block, its body is injected as
 * a system prompt into the LLM call — turning the model into a specialist.
 */
@Injectable()
export class SkillsService implements OnModuleInit {
  /** Write the seed skills on first boot (idempotent — never overwrites). */
  async onModuleInit(): Promise<void> {
    if (!existsSync(PATHS.skills)) mkdirSync(PATHS.skills, { recursive: true });
    for (const seed of [...SEED_SKILLS, ...SEEDANCE_SKILLS]) {
      const file = this.skillFile(seed.id);
      if (!existsSync(file)) {
        mkdirSync(join(PATHS.skills, seed.id), { recursive: true });
        writeFileSync(file, seed.content, 'utf-8');
      }
    }
  }

  /** Import Seedance skill pack — skips existing files. */
  seedSeedance(): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;
    for (const seed of SEEDANCE_SKILLS) {
      const file = this.skillFile(seed.id);
      if (existsSync(file)) {
        skipped++;
        continue;
      }
      mkdirSync(join(PATHS.skills, seed.id), { recursive: true });
      writeFileSync(file, seed.content, 'utf-8');
      imported++;
    }
    return { imported, skipped };
  }

  private skillDir(id: string): string {
    if (!ID_PATTERN.test(id)) {
      throw new BadRequestException('Skill id may only contain a-z, 0-9, hyphen');
    }
    return join(PATHS.skills, id);
  }

  private skillFile(id: string): string {
    return join(this.skillDir(id), 'SKILL.md');
  }

  private parseFrontmatter(raw: string, fallbackId: string): SkillSummary {
    const name = raw.match(FRONTMATTER_NAME)?.[1]?.trim() ?? fallbackId;
    const description = raw.match(FRONTMATTER_DESC)?.[1]?.trim() ?? '';
    return { id: fallbackId, name, description };
  }

  list(): SkillSummary[] {
    if (!existsSync(PATHS.skills)) return [];
    const out: SkillSummary[] = [];
    const scan = (dir: string, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const sub = join(dir, entry.name);
        const skillPath = join(sub, 'SKILL.md');
        const id = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (existsSync(skillPath)) {
          out.push(this.parseFrontmatter(readFileSync(skillPath, 'utf-8'), id));
        }
        // recurse — nested skills may exist even if this dir has SKILL.md
        scan(sub, id);
      }
    };
    scan(PATHS.skills, '');
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(id: string): SkillDetail {
    const file = this.skillFile(id);
    if (!existsSync(file)) throw new NotFoundException(`Skill ${id} not found`);
    const content = readFileSync(file, 'utf-8');
    return { ...this.parseFrontmatter(content, id), content };
  }

  create(input: { id: string; name?: string; description?: string }): SkillSummary {
    const id = input.id.trim();
    const dir = this.skillDir(id); // validates id
    if (existsSync(dir)) throw new BadRequestException('Skill already exists');
    mkdirSync(dir, { recursive: true });
    const name = (input.name ?? id).trim();
    const description = (input.description ?? '').trim();
    const content = `---
name: ${name}
description: ${description}
---

# ${name}

在此编写技能方法论 / 系统指令。选中此技能的对话模型会把本文件作为系统提示词注入。
`;
    writeFileSync(this.skillFile(id), content, 'utf-8');
    return { id, name, description };
  }

  update(id: string, content: string): void {
    const file = this.skillFile(id);
    if (!existsSync(file)) throw new NotFoundException(`Skill ${id} not found`);
    writeFileSync(file, content, 'utf-8');
  }

  remove(id: string): void {
    const dir = this.skillDir(id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new NotFoundException(`Skill ${id} not found`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
