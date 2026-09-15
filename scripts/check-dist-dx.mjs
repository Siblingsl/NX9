/**
 * check-dist-dx.mjs — F-039 门禁：gitignore / scripts / vite alias / 无 tracked dist。
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`[F-039] ${msg}`);
  process.exit(1);
};

const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
if (!gitignore.split(/\r?\n/).some((l) => l.trim() === 'dist/')) {
  fail('.gitignore 缺少 dist/');
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const dev = String(pkg.scripts?.dev ?? '');
if (!dev.includes('@nx9/shared') || !dev.includes('build')) {
  fail('root scripts.dev 必须先 build @nx9/shared');
}
if (!pkg.scripts?.['check:dist-dx']) {
  fail('缺少 scripts.check:dist-dx');
}
if (!existsSync(resolve(root, 'scripts/ensure-shared-dist.mjs'))) {
  fail('缺少 scripts/ensure-shared-dist.mjs');
}
if (!String(pkg.scripts?.['dev:server'] ?? '').includes('predev:server')) {
  fail('dev:server 应经 predev:server / ensure-shared-dist');
}

const vite = readFileSync(resolve(root, 'apps/web/vite.config.ts'), 'utf8');
if (!vite.includes('@nx9/shared') || !/sharedSrc|packages\/shared\/src/.test(vite)) {
  fail('apps/web/vite.config.ts 未 alias @nx9/shared → source');
}

const vitest = readFileSync(resolve(root, 'apps/web/vitest.config.ts'), 'utf8');
if (!vitest.includes('@nx9/shared') || !vitest.includes('packages/shared/src')) {
  fail('apps/web/vitest.config.ts 未 alias @nx9/shared → source');
}

const tracked = spawnSync(
  'git',
  ['ls-files', '--', '**/dist/**', 'apps/*/dist/**', 'packages/*/dist/**'],
  { cwd: root, encoding: 'utf8', shell: true },
);
const files = (tracked.stdout || '')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => !f.includes('node_modules'));
if (files.length > 0) {
  fail(`仓库跟踪了 dist 产物，禁止提交：\n${files.slice(0, 20).join('\n')}`);
}

console.log('[F-039] dist DX 门禁通过');
