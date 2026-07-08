import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import type { SkillDetail, SkillSummary } from '@nx9/shared';
import { SkillsService } from './skills.service';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(): SkillSummary[] {
    return this.skills.list();
  }

  @Post('seed/seedance')
  seedSeedance(): { imported: number; skipped: number } {
    return this.skills.seedSeedance();
  }

  @Get(':id')
  read(@Param('id') id: string): SkillDetail {
    return this.skills.read(id);
  }

  @Post()
  create(@Body() body: { id: string; name?: string; description?: string }): SkillSummary {
    return this.skills.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { content: string }): { ok: boolean } {
    this.skills.update(id, body.content);
    return { ok: true };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    this.skills.remove(id);
    return { ok: true };
  }
}
