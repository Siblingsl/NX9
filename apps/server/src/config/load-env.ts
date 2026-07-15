import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Load KEY=VALUE pairs from a .env file without overriding existing process.env. */
export function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/** Load apps/server/.env when cwd is the server package (nest start / vitest). */
export function loadServerEnv(): void {
  loadEnvFile(join(process.cwd(), '.env'));
}
