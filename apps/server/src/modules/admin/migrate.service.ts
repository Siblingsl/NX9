import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { WorkspacePayload, WorkspaceSummary } from '@nx9/shared';
import { normalizeWorkspacePayload } from '@nx9/shared';
import { JsonStoreService } from '../../common/json-store.service';
import { PATHS } from '../../config/app.config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class MigrateService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  storageMode(): 'json' | 'prisma' {
    return (process.env.NX9_STORAGE ?? 'json') as 'json' | 'prisma';
  }

  async migrateJsonToPrisma(ownerId?: string) {
    const owner = ownerId
      ? await this.users.get(ownerId)
      : await this.users.ensureDefault();

    const index = this.store.readJson<WorkspaceSummary[]>(PATHS.workspaceIndex, []);
    const ids = new Set<string>();
    for (const item of index) ids.add(item.id);

    if (!existsSync(PATHS.data)) {
      return { migrated: 0, skipped: 0, ownerId: owner.id };
    }
    for (const name of readdirSync(PATHS.data)) {
      const m = name.match(/^workspace_(ws-\d+-[\w-]+)\.json$/);
      if (m) ids.add(m[1]);
    }

    let migrated = 0;
    let skipped = 0;

    for (const id of ids) {
      const exists = await this.prisma.workspace.findUnique({ where: { id } });
      if (exists) {
        skipped += 1;
        continue;
      }
      const file = join(PATHS.data, `workspace_${id}.json`);
      if (!existsSync(file)) continue;
      const payload = normalizeWorkspacePayload(
        this.store.readJson<Partial<WorkspacePayload>>(file, {
          blocks: [],
          links: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      );
      const meta = index.find((w) => w.id === id);
      await this.prisma.workspace.create({
        data: {
          id,
          title: meta?.title ?? id,
          ownerId: owner.id,
          payload: JSON.stringify(payload),
          blockCount: payload.blocks.length,
          shotCount: payload.storyboard?.shots?.length ?? 0,
          createdAt: meta?.createdAt ? new Date(meta.createdAt) : undefined,
        },
      });
      migrated += 1;
    }

    return { migrated, skipped, ownerId: owner.id, mode: 'prisma' as const };
  }
}
