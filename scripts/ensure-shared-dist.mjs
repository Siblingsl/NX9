/**
 * ensure-shared-dist.mjs — F-039：server/nest 依赖 @nx9/shared dist；缺失时自动 build。
 * Web Vite 已 alias 到 packages/shared/src，不依赖本脚本。
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = resolve(root, 'packages/shared/dist/esm/index.js');

if (existsSync(marker)) {
  process.exit(0);
}

console.warn('[F-039] @nx9/shared dist 缺失，正在 build…');
const r = spawnSync('pnpm', ['--filter', '@nx9/shared', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status === 0 ? 0 : r.status ?? 1);
