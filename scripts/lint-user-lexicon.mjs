/**
 * 用户词典 lint 检查 — 禁止 UI 文案出现 Node/Workflow/Prompt 等词
 * 用法: node scripts/lint-user-lexicon.mjs
 */
import { readFileSync } from 'fs';
import { globSync } from 'glob';

const BANNED = ['Node', 'Workflow', 'Prompt', 'Execute', 'Asset', 'Provider', 'Pipeline'];

const SOURCE_GLOBS = [
  'apps/web/src/**/*.{tsx,ts}',
  'packages/shared/src/**/*.{ts,tsx}',
];

const EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/test/**',
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/user-lexicon.ts',
  '**/block-catalog.ts',
  '**/socket-registry.ts',
];

let errors = 0;

for (const glob of SOURCE_GLOBS) {
  const files = globSync(glob, { ignore: EXCLUDE });
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const word of BANNED) {
      const re = new RegExp(`\\b${word}\\b`, 'g');
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const line = content.split('\n')[lineNum - 1]?.trim();
        if (line && !line.startsWith('//') && !line.startsWith('*') && !line.includes('import ') && !line.includes('export type') && !line.includes('// eslint-disable')) {
          console.error(`[LEXICON] ${file}:${lineNum} — 禁止词 "${word}" 出现在: "${line?.substring(0, 80)}"`);
          errors++;
        }
      }
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ 发现 ${errors} 处违反用户词典的文案。使用 translate() 或替换为 §2.2 词典词。`);
  process.exit(1);
} else {
  console.log('✅ 用户词典检查通过，无禁止词。');
}
