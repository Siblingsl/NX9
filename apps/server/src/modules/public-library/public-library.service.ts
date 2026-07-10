import { Injectable } from '@nestjs/common';
import { join } from 'path';
import type { PublicLibraryPayload } from '@nx9/shared';
import { emptyPublicLibrary } from '@nx9/shared';
import { JsonStoreService } from '../../common/json-store.service';
import { PATHS } from '../../config/app.config';

@Injectable()
export class PublicLibraryService {
  constructor(private readonly store: JsonStoreService) {}

  private fileForOwner(ownerId: string) {
    const safe = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
    return join(PATHS.data, `public_library_${safe}.json`);
  }

  load(ownerId?: string): PublicLibraryPayload {
    const id = ownerId?.trim() || 'default';
    return this.store.readJson<PublicLibraryPayload>(this.fileForOwner(id), emptyPublicLibrary());
  }

  save(ownerId: string | undefined, payload: PublicLibraryPayload): PublicLibraryPayload {
    const id = ownerId?.trim() || 'default';
    const normalized: PublicLibraryPayload = {
      version: 1,
      characters: payload.characters ?? [],
      templates: payload.templates ?? [],
      sounds: payload.sounds ?? [],
    };
    this.store.writeJson(this.fileForOwner(id), normalized);
    return normalized;
  }
}
