import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

writeFileSync(join(root, 'dist/esm/package.json'), JSON.stringify({ type: 'module' }) + '\n');
writeFileSync(join(root, 'dist/cjs/package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
