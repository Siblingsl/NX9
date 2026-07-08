import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';

@Injectable()
export class JsonStoreService {
  readJson<T>(filePath: string, fallback: T): T {
    if (!existsSync(filePath)) return fallback;
    try {
      const raw = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  writeJson(filePath: string, data: unknown): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tmp, filePath);
  }

  ensureDirs(paths: string[]): void {
    for (const p of paths) {
      if (!existsSync(p)) mkdirSync(p, { recursive: true });
    }
  }
}
