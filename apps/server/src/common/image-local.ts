import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../config/app.config';
import { resolveMediaUrl } from './media-path';

const DOWNLOAD_TIMEOUT_MS = 30_000;

export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim()) || url.trim().startsWith('data:');
}

/**
 * PG-18: 把 /media、http(s)、data URL 落到本地文件，供 sharp 使用。
 * 无法解析时返回 null（调用方决定是抛错还是跳过）。
 */
export async function materializeImageToLocal(url: string): Promise<string | null> {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const local = resolveMediaUrl(trimmed);
  if (local) return local;

  if (!existsSync(PATHS.images)) mkdirSync(PATHS.images, { recursive: true });

  if (trimmed.startsWith('data:')) {
    const m = trimmed.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const mime = m[1].toLowerCase();
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const name = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const out = join(PATHS.images, name);
    writeFileSync(out, Buffer.from(m[2], 'base64'));
    return out;
  }

  if (!/^https?:\/\//i.test(trimmed)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(trimmed, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const name = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const out = join(PATHS.images, name);
    writeFileSync(out, buf);
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function materializeImagesToLocal(urls: string[]): Promise<{
  paths: string[];
  failed: string[];
}> {
  const paths: string[] = [];
  const failed: string[] = [];
  for (const url of urls) {
    const local = await materializeImageToLocal(url);
    if (local) paths.push(local);
    else failed.push(url);
  }
  return { paths, failed };
}
