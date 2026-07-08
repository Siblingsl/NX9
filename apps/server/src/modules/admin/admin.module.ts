import { Module } from '@nestjs/common';
import { JsonStoreService } from '../../common/json-store.service';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { MigrateService } from './migrate.service';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
  providers: [MigrateService, JsonStoreService],
})
export class AdminModule {}
