import { existsSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../config/app.config';

/** Resolve /media/{folder}/{name} to local filesystem path. */
export function resolveMediaUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/^\/media\/(uploads|exports|thumbs|audio|images|videos)\/(.+)$/);
  if (!m) return null;
  const folder = m[1] as keyof typeof PATHS;
  const name = decodeURIComponent(m[2]);
  const base = PATHS[folder as 'uploads'];
  if (!base) return null;
  const full = join(base, name.replace(/\.\./g, ''));
  return existsSync(full) ? full : null;
}
