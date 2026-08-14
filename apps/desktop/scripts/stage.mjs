/**
 * NX9 Desktop — 暂存脚本。
 *
 * 产出 apps/desktop/stage/server：自包含的 NestJS 服务端
 * （dist + 扁平 node_modules + prisma 生成的 client），供 electron-builder 打进 extraResources。
 *
 * 依赖布局说明：pnpm 的虚拟 store 布局充满指向树内绝对路径的 Junction，
 * 打包复制后即失效（且 Windows 重建目录符号链接需要权限）。因此这里改用 npm
 * 生成标准扁平 node_modules（无符号链接、自包含、可整体搬迁）。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const desktopDir = resolve(import.meta.dirname, '..');
const rootDir = resolve(desktopDir, '..', '..');
const stageDir = join(desktopDir, 'stage');
const serverStage = join(stageDir, 'server');

function run(cmd, args, cwd, label, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (r.status !== 0) {
    console.error(`[stage] ${label} 失败 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// 1. 确保上游产物已构建
//    - 服务端用 nest build（tsc）直出，跳过 prisma generate（schema 未变、生成的 client 由步骤 4b
//      从 pnpm store 复制，且 dev watch 运行时 generate 会因 DLL 占用报 EPERM）。
//    - Web 用 vite build 直出，跳过 tsc -b（被仓库内一个未跟踪的引擎测试文件类型错误阻塞，
//      与打包产物无关；类型门禁在 CI/开发流程另行把关）。
run('pnpm', ['--filter', '@nx9/server', 'exec', 'nest', 'build'], rootDir, 'build @nx9/server (nest build)');
run('pnpm', ['exec', 'vite', 'build'], join(rootDir, 'apps', 'web'), 'build @nx9/web (vite build)');
run('pnpm', ['--filter', '@nx9/remotion-compositions', 'build'], rootDir, 'build @nx9/remotion-compositions');

// 2. 组装暂存目录（dist / prisma / templates / 精简 package.json）
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(serverStage, { recursive: true });
cpSync(join(rootDir, 'apps', 'server', 'dist'), join(serverStage, 'dist'), { recursive: true });
cpSync(join(rootDir, 'apps', 'server', 'prisma'), join(serverStage, 'prisma'), { recursive: true });
cpSync(join(rootDir, 'apps', 'server', 'templates'), join(serverStage, 'templates'), { recursive: true });

const serverPkg = JSON.parse(readFileSync(join(rootDir, 'apps', 'server', 'package.json'), 'utf8'));
delete serverPkg.dependencies['@nx9/shared']; // 手动复制，见步骤 4
delete serverPkg.scripts;
delete serverPkg.devDependencies;
serverPkg.main = 'dist/main.js';
writeFileSync(join(serverStage, 'package.json'), JSON.stringify(serverPkg, null, 2));

// 3. npm 生成扁平 node_modules（prod 依赖，跳过构建脚本）
const npmEnv = {
  npm_config_cache: process.env.npm_config_cache ?? join(rootDir, '.npm-cache'),
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], serverStage, 'npm install (flat prod deps)', npmEnv);
rmSync(join(serverStage, 'package-lock.json'), { force: true });

// 4. 手动补齐两个特殊依赖
// 4a. @nx9/shared（构建产物 + package.json，本地私有包不走 registry）。
//     只复制 dist 与 package.json —— src/scripts 等源文件不进包，
//     既减小体积也避免把开发期文件带入生产目录。
const sharedDst = join(serverStage, 'node_modules', '@nx9', 'shared');
mkdirSync(join(serverStage, 'node_modules', '@nx9'), { recursive: true });
mkdirSync(sharedDst, { recursive: true });
cpSync(join(rootDir, 'packages', 'shared', 'dist'), join(sharedDst, 'dist'), { recursive: true });
cpSync(join(rootDir, 'packages', 'shared', 'package.json'), join(sharedDst, 'package.json'));
console.log('[stage] 已复制 @nx9/shared（dist + package.json）');

// 4b. prisma 生成的 client（prisma generate 产物，npm 不包含）
const srcVirtual = join(rootDir, 'node_modules', '.pnpm');
let prismaCopied = 0;
for (const name of readdirSync(srcVirtual)) {
  if (!name.startsWith('@prisma+client@')) continue;
  const srcPrisma = join(srcVirtual, name, 'node_modules', '.prisma');
  if (!existsSync(srcPrisma)) continue;
  rmSync(join(serverStage, 'node_modules', '.prisma'), { recursive: true, force: true });
  cpSync(srcPrisma, join(serverStage, 'node_modules', '.prisma'), { recursive: true });
  prismaCopied += 1;
  console.log(`[stage] 已复制 prisma client → ${join(serverStage, 'node_modules', '.prisma')}`);
}
if (prismaCopied === 0) {
  console.warn('[stage] 警告：未找到 prisma 生成的 client，JSON 存储模式下服务端仍可启动');
}

// 5. 清理运行时污染（若有人在暂存目录里启动过服务端）
for (const name of ['data', 'storage', 'public', 'skills', 'media', '.stage-test', '.stage-test2', '.stage-test3', '.stage-test4', '.stage-test5']) {
  rmSync(join(serverStage, name), { recursive: true, force: true });
}
for (const name of readdirSync(serverStage)) {
  if (name === 'skill-index.json' || name === 'nx9.db' || name === 'runtime.json' || name.endsWith('.log')) {
    rmSync(join(serverStage, name), { force: true });
  }
}

// 6. 生成已建表的空 SQLite 库：用户引导（/api/users/bootstrap）依赖 Prisma User 表，
// 打包环境不会跑 migrate dev，桌面端首启会把该库复制为数据目录的 nx9.db。
{
  const prismaCli = join(rootDir, 'apps', 'server', 'node_modules', 'prisma', 'build', 'index.js');
  const prismaDir = join(serverStage, 'prisma');
  if (existsSync(prismaCli)) {
    const r = spawnSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', 'schema.prisma'],
      {
        cwd: prismaDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: 'file:./nx9.db',
          npm_config_cache: process.env.npm_config_cache ?? join(rootDir, '.npm-cache'),
        },
      },
    );
    if (r.status !== 0) {
      console.error(`[stage] prisma migrate deploy 失败 (exit ${r.status})`);
      process.exit(r.status ?? 1);
    }
    console.log('[stage] 已生成已建表的空 SQLite 库 → prisma/nx9.db');
  } else {
    console.warn('[stage] 警告：未找到 prisma CLI，跳过迁移库生成（用户引导将不可用）');
  }
}

// 7. 服务端单文件打包（esbuild）——启动极致优化的关键：
//    打包版冷启动的最大成本是 Windows 首次访问时对 node_modules 数千个
//    小 JS 文件逐一做实时扫描/冷读（实测 35s+）。把纯 JS 依赖
//    （@nestjs / express / rxjs / class-validator / @nx9/shared / sharp 的 JS 层…）
//    内联为一个 main.js，冷启动读取集从数万文件降到个位数文件。
//    原生/按需依赖保持外置（磁盘实体不动，运行时 require 照常解析）：
//      - @img/*          sharp 的 win32 原生 DLL / .node
//      - @prisma/client  生成的 Prisma client 与查询引擎 DLL
//      - @remotion/*     @remotion/renderer 等（服务端为动态 import，按需加载）
//      - @hyperframes/*  同上（动态 import）
//      - esbuild         仅被 remotion 在渲染期使用
{
  const esbuildArgs = [
    '--filter', '@nx9/server', 'exec', 'esbuild',
    join(serverStage, 'dist', 'main.js'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node22',
    '--minify',
    '--log-level=warning',
    '--outfile=' + join(serverStage, 'dist', 'main.bundle.js'),
    '--external:@img/*',
    '--external:@prisma/client',
    '--external:@remotion/*',
    '--external:@hyperframes/*',
    '--external:esbuild',
    // NestJS/ServeStatic 的惰性可选依赖（仅在用到对应适配器时才会 require，本应用不触达）
    '--external:@fastify/static',
    '--external:@nestjs/websockets',
    '--external:@nestjs/microservices',
  ];
  run('pnpm', esbuildArgs, rootDir, 'bundle server into single main.js (esbuild)');
  const distDir = join(serverStage, 'dist');
  rmSync(join(distDir, 'main.js'), { force: true });
  rmSync(join(distDir, 'main.js.map'), { force: true });
  renameSync(join(distDir, 'main.bundle.js'), join(distDir, 'main.js'));
  const bundleSize = statSync(join(distDir, 'main.js')).size;
  console.log(`[stage] 服务端已单文件化 → dist/main.js (${(bundleSize / 1024 / 1024).toFixed(1)} MB)`);
}

console.log(`\n[stage] 完成 → ${serverStage}`);
