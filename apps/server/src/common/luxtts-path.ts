import { existsSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { PATHS } from '../config/app.config';
import { resolveMediaUrl } from './media-path';

const AUDIO_EXTS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac']);

function underStorageRoot(full: string): boolean {
  const roots = [
    PATHS.uploads,
    PATHS.audio,
    PATHS.exports,
    PATHS.data,
    PATHS.root,
  ].map((p) => resolve(p));
  const normalized = resolve(full);
  return roots.some((root) => normalized === root || normalized.startsWith(`${root}\\`) || normalized.startsWith(`${root}/`));
}

/** Resolve /media/... URL or absolute path to a local audio file for LuxTTS. */
export function resolveReferenceAudioPath(
  referenceAudioUrl?: string | null,
  referenceAudioPath?: string | null,
): string | null {
  if (referenceAudioPath?.trim()) {
    const full = isAbsolute(referenceAudioPath) ? referenceAudioPath : resolve(PATHS.root, referenceAudioPath);
    if (existsSync(full) && underStorageRoot(full)) return full;
    return null;
  }
  if (!referenceAudioUrl?.trim()) return null;

  const fromMedia = resolveMediaUrl(referenceAudioUrl);
  if (fromMedia) return fromMedia;

  if (referenceAudioUrl.startsWith('/')) return null;

  const abs = resolve(referenceAudioUrl);
  if (existsSync(abs) && underStorageRoot(abs)) return abs;
  return null;
}

export function isAudioFile(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of AUDIO_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}
