import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from './prisma/prisma.service';

/**
 * 运行时幂等迁移（仅 SQLite / 桌面打包形态）。
 *
 * 背景：全新安装的库由 stage 阶段 `prisma migrate deploy` 生成，表结构完整；
 * 但老版本安装的 dataDir/nx9.db 是旧 schema（无 passwordHash 列、无 AuthSession 表）。
 * 打包产物内没有 prisma CLI（devDependency 不随包分发），无法执行 migrate deploy，
 * 因此在服务端启动时做一次「缺啥补啥」的幂等 DDL，保证旧库平滑升级。
 *
 * 注意：仅当缺失时才执行，不写 _prisma_migrations 历史 —— 打包版不跑 migrate deploy，
 * 不会出现历史记录与库状态不一致；开发版（有 CLI）仍走 migrate dev 管理迁移。
 */
@Injectable()
export class RuntimeMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RuntimeMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.apply();
    } catch (err) {
      this.logger.error(`运行时迁移失败: ${String(err).slice(0, 300)}`);
    }
  }

  private async apply(): Promise<void> {
    const table = await this.tableExists('AuthSession');
    const col = await this.columnExists('User', 'passwordHash');
    const nameIdx = await this.indexExists('User_name_key');
    // email 列在 schema 中为可空 @unique（无独立迁移文件，历史安装/全新 stage 库均可能缺失）
    const emailCol = await this.columnExists('User', 'email');
    const emailIdx = await this.indexExists('User_email_key');

    if (table && col && nameIdx && emailCol && emailIdx) return; // 已是最新

    const statements: string[] = [];
    const missing: string[] = [];
    if (!(table && col && nameIdx)) {
      missing.push(`AuthSession 表(${table}) / passwordHash 列(${col}) / name 索引(${nameIdx})`);
      statements.push(...this.splitStatements(await this.readMigrationSql()));
    }
    if (!emailCol) {
      missing.push(`email 列(${emailCol})`);
      statements.push('ALTER TABLE "User" ADD COLUMN "email" TEXT;');
    }
    if (!emailIdx) {
      missing.push(`email 唯一索引(${emailIdx})`);
      statements.push('CREATE UNIQUE INDEX "User_email_key" ON "User"("email");');
    }
    this.logger.log(`运行时迁移：${missing.join(' / ')}`);
    for (const statement of statements) {
      try {
        await this.prisma.$executeRawUnsafe(statement);
      } catch (err) {
        // SQLite 无 IF NOT EXISTS 语义：已存在对象的 DDL 会报错，属预期，忽略
        this.logger.warn(`运行时迁移跳过（可能已存在）: ${String(err).slice(0, 160)}`);
      }
    }
  }

  private async tableExists(name: string): Promise<boolean> {
    const r = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='" + name + "'",
    );
    return (r?.[0]?.n ?? 0) > 0;
  }

  private async columnExists(table: string, column: string): Promise<boolean> {
    const r = await this.prisma.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info(${table})`,
    );
    return (r ?? []).some((c: { name: string }) => c.name === column);
  }

  private async indexExists(name: string): Promise<boolean> {
    const r = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='" + name + "'",
    );
    return (r?.[0]?.n ?? 0) > 0;
  }

  /** 优先读打包内的迁移 SQL；读不到时回退到内置 DDL（与迁移文件保持一致） */
  private readMigrationSql(): string {
    const resourcesPath =
      (process as unknown as { resourcesPath?: string }).resourcesPath ?? '';
    const cwd = process.cwd();
    const candidates = [
      join(resourcesPath, 'server', 'prisma', 'migrations', '20260815000000_add_auth', 'migration.sql'),
      // 打包版 cwd = 数据目录（exe 同级/nx9-data），resources 在 exe 同级
      join(cwd, '..', 'resources', 'server', 'prisma', 'migrations', '20260815000000_add_auth', 'migration.sql'),
      join(cwd, 'prisma', 'migrations', '20260815000000_add_auth', 'migration.sql'),
      join(cwd, '..', '..', 'apps', 'server', 'prisma', 'migrations', '20260815000000_add_auth', 'migration.sql'),
    ];
    for (const file of candidates) {
      if (existsSync(file)) {
        try {
          return readFileSync(file, 'utf8');
        } catch {
          /* continue */
        }
      }
    }
    return `
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
CREATE TABLE "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL, CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");
`;
  }

  private splitStatements(sql: string): string[] {
    return sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => (s.endsWith(';') ? s : `${s};`));
  }
}
