/**
 * SRV-04: 渲染任务落盘，进程重启后轮询仍可恢复。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PATHS } from '../../config/app.config';

export const HF_TASKS_FILE = join(PATHS.data, 'render-tasks', 'hyperframes.json');
export const REMOTION_TASKS_FILE = join(PATHS.data, 'render-tasks', 'remotion.json');
export const VIDEO_EDIT_TASKS_FILE = join(PATHS.data, 'render-tasks', 'video-edit.json');

const MAX_TASKS = 200;

export function loadTaskRecords<T>(filePath: string): Record<string, T> {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, T>)
      : {};
  } catch {
    return {};
  }
}

export function saveTaskRecords<T extends { updatedAt?: number; createdAt?: number }>(
  filePath: string,
  records: Record<string, T>,
): void {
  if (!filePath) return;
  const entries = Object.entries(records).sort((a, b) => {
    const ta = a[1].updatedAt ?? a[1].createdAt ?? 0;
    const tb = b[1].updatedAt ?? b[1].createdAt ?? 0;
    return tb - ta;
  });
  const pruned = Object.fromEntries(entries.slice(0, MAX_TASKS));
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(pruned, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

export function mapToRecords<T>(map: Map<string, T>): Record<string, T> {
  return Object.fromEntries(map.entries());
}

export function recordsToMap<T>(records: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(records));
}
