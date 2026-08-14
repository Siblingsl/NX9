/**
 * NX9 Desktop — electron-builder 打包入口。
 *
 * 将 electron / electron-builder 的下载缓存指到工作区内（沙箱环境 AppData 不可写），
 * 然后以 apps/desktop 为 cwd 执行 electron-builder --win。
 * 用法：node apps/desktop/scripts/pack.mjs [--dir] [--publish never]
 */
import { spawnSync } from 'child_process';
import { resolve } from 'path';

const desktopDir = resolve(import.meta.dirname, '..');
const rootDir = resolve(desktopDir, '..', '..');

process.env.ELECTRON_BUILDER_CACHE =
  process.env.ELECTRON_BUILDER_CACHE ?? resolve(rootDir, '.electron-builder-cache');
process.env.npm_config_cache =
  process.env.npm_config_cache ?? resolve(rootDir, '.npm-cache');
// electron-builder 的 NSIS / winCodeSign 等工具默认从 GitHub 下载，直连不可达时走 npmmirror 镜像
process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
  'https://npmmirror.com/mirrors/electron-builder-binaries/';

const args = process.argv.slice(2);
console.log(`[pack] electron-builder --win ${args.join(' ')}`);

// 直接以 node 运行 electron-builder 的 CLI 入口（避免 .bin 不在 PATH 的问题）
const electronBuilderCli = resolve(
  desktopDir,
  'node_modules',
  'electron-builder',
  'out',
  'cli',
  'cli.js',
);
const r = spawnSync(process.execPath, [electronBuilderCli, '--win', ...args], {
  cwd: desktopDir,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
