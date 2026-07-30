import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { SkillDetail, SkillMetadata, SkillSummary, SkillValidationResult, GenPromptPack } from '@nx9/shared';
import { SkillsService } from './skills.service';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get('index')
  getIndex(): SkillSummary[] {
    return this.skills.getIndex();
  }

  @Post('reindex')
  reindex(): { ok: boolean } {
    this.skills.buildIndex();
    return { ok: true };
  }

  @Get()
  list(): SkillSummary[] {
    return this.skills.list();
  }

  /** Gen Template 拼装包批量接口（须在 :id 之前） */
  @Get('gen-packs')
  listGenPacks(@Query('ids') ids?: string): GenPromptPack[] {
    const list = ids
      ? ids.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.skills.listGenPacks(list);
  }

  @Get(':id/gen-pack')
  getGenPack(@Param('id') id: string): GenPromptPack {
    return this.skills.getGenPack(id);
  }

  @Post('seed/seedance')
  seedSeedance(): { imported: number; skipped: number } {
    return this.skills.seedSeedance();
  }

  @Get(':id')
  read(@Param('id') id: string): SkillDetail {
    return this.skills.read(id);
  }

  @Get(':id/validate')
  validate(@Param('id') id: string): SkillValidationResult {
    return this.skills.validate(id);
  }

  @Post(':id/validate')
  validatePost(@Param('id') id: string): SkillValidationResult {
    return this.skills.validate(id);
  }

  @Post(':id/reset')
  reset(@Param('id') id: string): { ok: boolean } {
    this.skills.reset(id);
    return { ok: true };
  }

  @Get(':id/files')
  listFiles(@Param('id') id: string): { files: string[] } {
    return { files: this.skills.listFiles(id) };
  }

  @Get(':id/files/(.*)')
  readFile(@Param('id') id: string, @Param('0') filePath: string): { content: string; path: string } {
    const content = this.skills.readFile(id, filePath);
    return { content, path: filePath };
  }

  @Put(':id/files/(.*)')
  writeFile(@Param('id') id: string, @Param('0') filePath: string, @Body() body: { content: string }): { ok: boolean } {
    this.skills.writeFile(id, filePath, body.content);
    return { ok: true };
  }

  @Post()
  create(@Body() body: { id: string; name?: string; description?: string }): SkillSummary {
    return this.skills.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { content?: string; metadata?: Partial<SkillMetadata> },
  ): { ok: boolean } {
    this.skills.update(id, body);
    return { ok: true };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    this.skills.remove(id);
    return { ok: true };
  }
}
