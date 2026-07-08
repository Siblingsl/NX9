import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { LIMITS, PATHS } from '../../config/app.config';

let thumbQueue: Promise<void> = Promise.resolve();
let activeThumbs = 0;

@Injectable()
export class AssetsService {
  listUploads() {
    if (!existsSync(PATHS.uploads)) return [];
    return readdirSync(PATHS.uploads)
      .filter((f) => !f.startsWith('.'))
      .map((name) => {
        const full = join(PATHS.uploads, name);
        const stat = statSync(full);
        return { name, size: stat.size, updatedAt: stat.mtimeMs };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  resolveUploadPath(name: string) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(PATHS.uploads, safe);
  }

  publicUrl(
    folder: 'uploads' | 'exports' | 'thumbs' | 'audio' | 'images' | 'videos',
    name: string,
  ) {
    return `/media/${folder}/${encodeURIComponent(name)}`;
  }

  enqueueThumb(sourcePath: string, thumbName: string): Promise<string | null> {
    const task = async () => {
      activeThumbs += 1;
      try {
        const out = join(PATHS.thumbs, thumbName);
        await sharp(sourcePath)
          .rotate()
          .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 72 })
          .toFile(out);
        return this.publicUrl('thumbs', thumbName);
      } catch {
        return null;
      } finally {
        activeThumbs -= 1;
      }
    };

    const run = (): Promise<string | null> => {
      if (activeThumbs >= LIMITS.thumbConcurrency) {
        return new Promise((resolve) => setTimeout(() => resolve(run()), 50));
      }
      return task();
    };

    const result = thumbQueue.then(run);
    thumbQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
