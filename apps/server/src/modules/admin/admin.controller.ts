import { Body, Controller, Get, Post } from '@nestjs/common';
import { MigrateService } from './migrate.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly migrateService: MigrateService) {}

  @Get('storage')
  storage() {
    return { mode: this.migrateService.storageMode() };
  }

  @Post('migrate-json-to-prisma')
  migrateJsonToPrisma(@Body() body?: { ownerId?: string }) {
    return this.migrateService.migrateJsonToPrisma(body?.ownerId);
  }
}
