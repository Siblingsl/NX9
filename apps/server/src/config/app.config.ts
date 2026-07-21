import { join } from 'path';

export const APP_VERSION = '0.1.0';
export const HOST = process.env.NX9_HOST ?? '127.0.0.1';
export const PORT = Number(process.env.NX9_PORT ?? 3001);

/** Monorepo root — cwd is apps/server when started via pnpm workspace */
const ROOT = join(process.cwd(), '..', '..');

export const PATHS = {
  root: ROOT,
  data: join(ROOT, 'data'),
  uploads: join(ROOT, 'storage', 'uploads'),
  exports: join(ROOT, 'storage', 'exports'),
  thumbs: join(ROOT, 'storage', 'thumbs'),
  audio: join(ROOT, 'storage', 'audio'),
  images: join(ROOT, 'storage', 'images'),
  videos: join(ROOT, 'storage', 'videos'),
  skills: join(ROOT, 'skills'),
  workspaceIndex: join(ROOT, 'data', 'workspaces.json'),
  settings: join(ROOT, 'data', 'settings.json'),
};

export const LIMITS = {
  jsonBodyMb: 50,
  uploadMb: 20,
  thumbConcurrency: 3,
};
