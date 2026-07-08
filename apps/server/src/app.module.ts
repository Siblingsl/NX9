import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { JsonStoreService } from './common/json-store.service';
import { PATHS } from './config/app.config';
import { AssetsModule } from './modules/assets/assets.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SkillsModule } from './modules/skills/skills.module';
import { GridModule } from './modules/grid/grid.module';
import { MontageModule } from './modules/montage/montage.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { UsageModule } from './modules/usage/usage.module';
import { AdminModule } from './modules/admin/admin.module';
import { PrismaModule } from './prisma/prisma.module';
import { ImageOpsModule } from './modules/image-ops/image-ops.module';
import { ToolsModule } from './modules/tools/tools.module';
import { TopazModule } from './modules/topaz/topaz.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    HealthModule,
    WorkspaceModule,
    SettingsModule,
    AssetsModule,
    GatewayModule,
    SkillsModule,
    GridModule,
    MontageModule,
    TasksModule,
    PrismaModule,
    UsersModule,
    UsageModule,
    AdminModule,
    ImageOpsModule,
    ToolsModule,
    TopazModule,
    ServeStaticModule.forRoot(
      { rootPath: PATHS.uploads, serveRoot: '/media/uploads' },
      { rootPath: PATHS.exports, serveRoot: '/media/exports' },
      { rootPath: PATHS.thumbs, serveRoot: '/media/thumbs' },
      { rootPath: PATHS.audio, serveRoot: '/media/audio' },
      { rootPath: PATHS.images, serveRoot: '/media/images' },
      { rootPath: PATHS.videos, serveRoot: '/media/videos' },
    ),
  ],
  providers: [JsonStoreService],
})
export class AppModule {
  constructor(private readonly store: JsonStoreService) {
    this.store.ensureDirs([
      PATHS.data,
      PATHS.uploads,
      PATHS.exports,
      PATHS.thumbs,
      PATHS.audio,
      PATHS.images,
      PATHS.videos,
      PATHS.skills,
    ]);
  }
}
