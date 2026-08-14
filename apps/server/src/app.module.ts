import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { JsonStoreService } from './common/json-store.service';
import { PATHS } from './config/app.config';
import { AssetsModule } from './modules/assets/assets.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AgentModule } from './modules/agent/agent.module';
import { HealthModule } from './modules/health/health.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SkillsModule } from './modules/skills/skills.module';
import { GridModule } from './modules/grid/grid.module';
import { MontageModule } from './modules/montage/montage.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsageModule } from './modules/usage/usage.module';
import { AdminModule } from './modules/admin/admin.module';
import { PrismaModule } from './prisma/prisma.module';
import { ImageOpsModule } from './modules/image-ops/image-ops.module';
import { PictureModule } from './modules/picture/picture.module';
import { ToolsModule } from './modules/tools/tools.module';
import { TopazModule } from './modules/topaz/topaz.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { PublicLibraryModule } from './modules/public-library/public-library.module';
import { ExportModule } from './modules/export/export.module';

/**
 * NX9_SERVE_WEB 生产开关：显式指定 web 构建产物目录时，由服务端同源托管前端
 * （桌面 Electron 打包 / 单服务部署形态），SPA 回退 index.html，/api /media 保持透传。
 * 未设置时保持纯 API 服务行为，开发模式零影响。
 */
const WEB_DIST = process.env.NX9_SERVE_WEB;
const webStaticModules = WEB_DIST && existsSync(WEB_DIST)
  ? [
      ServeStaticModule.forRoot({
        rootPath: WEB_DIST,
        exclude: ['/api/{*splat}', '/media/{*splat}'],
        serveStaticOptions: { index: 'index.html' },
      }),
    ]
  : [];

@Module({
  imports: [
    HealthModule,
    WorkspaceModule,
    PublicLibraryModule,
    SettingsModule,
    AssetsModule,
    GatewayModule,
    AgentModule,
    SkillsModule,
    GridModule,
    MontageModule,
    TasksModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    UsageModule,
    AdminModule,
    ImageOpsModule,
    PictureModule,
    ToolsModule,
    TopazModule,
    ExportModule,
    ServeStaticModule.forRoot(
      { rootPath: PATHS.uploads, serveRoot: '/media/uploads' },
      { rootPath: PATHS.exports, serveRoot: '/media/exports' },
      { rootPath: PATHS.thumbs, serveRoot: '/media/thumbs' },
      { rootPath: PATHS.audio, serveRoot: '/media/audio' },
      { rootPath: PATHS.images, serveRoot: '/media/images' },
      { rootPath: PATHS.videos, serveRoot: '/media/videos' },
      { rootPath: PATHS.remotion, serveRoot: '/media' },
      { rootPath: join(PATHS.data, 'export-manifests'), serveRoot: '/media/export-manifests' },
    ),
    ...webStaticModules,
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
      join(PATHS.data, 'export-manifests'),
    ]);
  }
}
