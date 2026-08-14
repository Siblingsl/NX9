import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RuntimeMigrationService } from '../runtime-migration.service';

@Global()
@Module({
  providers: [PrismaService, RuntimeMigrationService],
  exports: [PrismaService, RuntimeMigrationService],
})
export class PrismaModule {}
