/**
 * 将 docs/nx9-shot-seeds-neutral.json 灌入
 * packages/shared/src/data/shot-library-seeds.ts
 *
 * Usage: node scripts/promote-shot-library-seeds.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'docs', 'nx9-shot-seeds-neutral.json');
const outPath = path.join(root, 'packages', 'shared', 'src', 'data', 'shot-library-seeds.ts');

const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const seeds = src.seeds;
if (!Array.isArray(seeds) || seeds.length === 0) {
  console.error('No seeds in', srcPath);
  process.exit(1);
}

const VALID_FAMILIES = new Set([
  'static',
  'dolly',
  'pan_tilt',
  'track',
  'crane',
  'orbit',
  'special',
]);

function esc(s) {
  return JSON.stringify(s ?? '');
}

const lines = [];
lines.push('/**');
lines.push(' * NX9 公共镜头库内置种子（中立中英对照）');
lines.push(' * 由 docs/nx9-shot-seeds-neutral.json 灌入；勿手改大批量条目。');
lines.push(' * 重新生成：node scripts/promote-shot-library-seeds.mjs');
lines.push(' */');
lines.push("import type { ShotMoveFamily } from '../types/creative-asset-center';");
lines.push('');
lines.push('export interface ShotLibrarySeed {');
lines.push('  id: string;');
lines.push('  sourceId: string;');
lines.push('  label: string;');
lines.push('  labelEn: string;');
lines.push('  systemId: string;');
lines.push('  system: string;');
lines.push('  category: string;');
lines.push('  moveFamily: ShotMoveFamily;');
lines.push('  cameraMove: string;');
lines.push('  shotSize: string;');
lines.push('  durationSec: number;');
lines.push('  purposeZh: string;');
lines.push('  purposeEn: string;');
lines.push('  promptZh: string;');
lines.push('  promptEn: string;');
lines.push('}');
lines.push('');
lines.push(`export const SHOT_LIBRARY_SEED_COUNT = ${seeds.length} as const;`);
lines.push('');
lines.push('export const SHOT_LIBRARY_SEEDS: readonly ShotLibrarySeed[] = [');

const dist = {};
const systems = {};
for (const s of seeds) {
  if (!VALID_FAMILIES.has(s.moveFamily)) {
    console.error('Invalid moveFamily for', s.id, s.moveFamily);
    process.exit(1);
  }
  if (!s.systemId || !s.system || !s.category) {
    console.error('Missing hierarchy for', s.id, {
      systemId: s.systemId,
      system: s.system,
      category: s.category,
    });
    process.exit(1);
  }
  dist[s.moveFamily] = (dist[s.moveFamily] || 0) + 1;
  systems[s.systemId] = (systems[s.systemId] || 0) + 1;
  lines.push('  {');
  lines.push(`    id: ${esc(s.id)},`);
  lines.push(`    sourceId: ${esc(s.sourceId)},`);
  lines.push(`    label: ${esc(s.label)},`);
  lines.push(`    labelEn: ${esc(s.labelEn)},`);
  lines.push(`    systemId: ${esc(s.systemId)},`);
  lines.push(`    system: ${esc(s.system)},`);
  lines.push(`    category: ${esc(s.category)},`);
  lines.push(`    moveFamily: ${esc(s.moveFamily)},`);
  lines.push(`    cameraMove: ${esc(s.cameraMove)},`);
  lines.push(`    shotSize: ${esc(s.shotSize)},`);
  lines.push(`    durationSec: ${Number(s.durationSec) || 0},`);
  lines.push(`    purposeZh: ${esc(s.purposeZh)},`);
  lines.push(`    purposeEn: ${esc(s.purposeEn)},`);
  lines.push(`    promptZh: ${esc(s.promptZh)},`);
  lines.push(`    promptEn: ${esc(s.promptEn)},`);
  lines.push('  },');
}
lines.push('];');
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

src.meta = {
  ...src.meta,
  status: 'promoted — wired into BUILTIN_BACKLOT_TEMPLATES via shot-library-seeds.ts',
  promotedAt: new Date().toISOString(),
  promotedCount: seeds.length,
};
fs.writeFileSync(srcPath, JSON.stringify(src, null, 2) + '\n', 'utf8');

console.log('wrote', path.relative(root, outPath), 'count', seeds.length);
console.log('families', dist);
console.log('systems', systems);
