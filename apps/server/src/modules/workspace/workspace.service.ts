import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { WorkspacePayload, WorkspaceSummary } from '@nx9/shared';
import { normalizeWorkspacePayload } from '@nx9/shared';
import { JsonStoreService } from '../../common/json-store.service';
import { PATHS } from '../../config/app.config';
import { PrismaWorkspaceStore } from './prisma-workspace.store';

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly prismaStore: PrismaWorkspaceStore,
  ) {}

  private usePrisma() {
    return (process.env.NX9_STORAGE ?? 'json') === 'prisma';
  }

  private workspaceFile(id: string) {
    return join(PATHS.data, `workspace_${id}.json`);
  }

  private recoverFromFiles(): WorkspaceSummary[] {
    if (!existsSync(PATHS.data)) return [];
    const items: WorkspaceSummary[] = [];
    for (const name of readdirSync(PATHS.data)) {
      const match = name.match(/^workspace_(ws-\d+-[\w-]+)\.json$/);
      if (!match) continue;
      const id = match[1];
      try {
        const payload = normalizeWorkspacePayload(
          this.store.readJson<Partial<WorkspacePayload>>(this.workspaceFile(id), {
            blocks: [],
            links: [],
            viewport: { x: 0, y: 0, zoom: 1 },
          }),
        );
        if (!Array.isArray(payload.blocks)) continue;
        const stat = statSync(this.workspaceFile(id));
        items.push({
          id,
          title: id,
          blockCount: payload.blocks.length,
          shotCount: payload.storyboard?.shots?.length ?? 0,
          createdAt: this.createdAtFromId(id, stat.mtimeMs),
          updatedAt: Math.round(stat.mtimeMs),
        });
      } catch {
        /* skip corrupt */
      }
    }
    return items.sort((a, b) => a.createdAt - b.createdAt);
  }

  private createdAtFromId(id: string, fallback: number) {
    const m = id.match(/^ws-(\d+)-/);
    if (!m) return Math.round(fallback);
    const n = Number(m[1]);
    return Number.isSafeInteger(n) && n > 0 ? n : Math.round(fallback);
  }

  private listJson(ownerId?: string): WorkspaceSummary[] {
    const list = this.store.readJson<WorkspaceSummary[]>(PATHS.workspaceIndex, []);
    const items =
      Array.isArray(list) && list.length > 0 ? list : this.recoverFromFiles();
    return ownerId ? items.filter((w) => w.ownerId === ownerId || !w.ownerId) : items;
  }

  async list(ownerId?: string): Promise<WorkspaceSummary[]> {
    if (this.usePrisma()) return this.prismaStore.list(ownerId);
    return this.listJson(ownerId);
  }

  async create(title?: string, ownerId?: string): Promise<WorkspaceSummary> {
    if (this.usePrisma()) return this.prismaStore.create(title, ownerId);
    const now = Date.now();
    const id = `ws-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const item: WorkspaceSummary = {
      id,
      title: title?.trim() || '未命名工作区',
      blockCount: 0,
      createdAt: now,
      updatedAt: now,
      ownerId,
    };
    const payload = normalizeWorkspacePayload({
      blocks: [],
      links: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      nextBlockIndex: 1,
    });
    this.store.writeJson(this.workspaceFile(id), payload);
    const list = this.listJson();
    list.push(item);
    this.store.writeJson(PATHS.workspaceIndex, list);
    return item;
  }

  async load(id: string): Promise<WorkspacePayload> {
    if (this.usePrisma()) return this.prismaStore.load(id);
    const file = this.workspaceFile(id);
    if (!existsSync(file)) throw new NotFoundException(`Workspace ${id} not found`);
    return normalizeWorkspacePayload(
      this.store.readJson<Partial<WorkspacePayload>>(file, {
        blocks: [],
        links: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    );
  }

  async save(id: string, payload: WorkspacePayload): Promise<WorkspaceSummary> {
    if (this.usePrisma()) return this.prismaStore.save(id, payload);
    const file = this.workspaceFile(id);
    if (!existsSync(file)) throw new NotFoundException(`Workspace ${id} not found`);

    const normalized = normalizeWorkspacePayload(payload);
    const existing = this.store.readJson<Partial<WorkspacePayload> | null>(file, null);
    const incomingEmpty =
      normalized.blocks.length === 0 &&
      normalized.links.length === 0 &&
      (normalized.storyboard?.shots?.length ?? 0) === 0;
    const existingHasContent =
      existing &&
      ((existing.blocks?.length ?? 0) > 0 ||
        (existing.links?.length ?? 0) > 0 ||
        (existing.storyboard?.shots?.length ?? 0) > 0);
    if (incomingEmpty && existingHasContent) {
      throw new BadRequestException('Refusing to overwrite non-empty workspace with empty payload');
    }

    this.store.writeJson(file, normalized);
    const list = this.listJson();
    const idx = list.findIndex((w) => w.id === id);
    const now = Date.now();
    const updated: WorkspaceSummary = {
      id,
      title: idx >= 0 ? list[idx].title : id,
      blockCount: normalized.blocks.length,
      shotCount: normalized.storyboard?.shots?.length ?? 0,
      createdAt: idx >= 0 ? list[idx].createdAt : this.createdAtFromId(id, now),
      updatedAt: now,
      ownerId: idx >= 0 ? list[idx].ownerId : undefined,
    };
    if (idx >= 0) list[idx] = updated;
    else list.push(updated);
    this.store.writeJson(PATHS.workspaceIndex, list);
    return updated;
  }

  async rename(id: string, title: string): Promise<WorkspaceSummary> {
    if (this.usePrisma()) return this.prismaStore.rename(id, title);
    const list = this.listJson();
    const idx = list.findIndex((w) => w.id === id);
    if (idx < 0) throw new NotFoundException(`Workspace ${id} not found`);
    list[idx] = { ...list[idx], title: title.trim() || list[idx].title, updatedAt: Date.now() };
    this.store.writeJson(PATHS.workspaceIndex, list);
    return list[idx];
  }

  async remove(id: string): Promise<void> {
    if (this.usePrisma()) return this.prismaStore.remove(id);
    const file = this.workspaceFile(id);
    if (existsSync(file)) {
      const { unlinkSync } = require('fs') as typeof import('fs');
      unlinkSync(file);
    }
    const list = this.listJson().filter((w) => w.id !== id);
    this.store.writeJson(PATHS.workspaceIndex, list);
  }

  async exportPayload(id: string): Promise<WorkspacePayload> {
    return this.load(id);
  }

  async importPayload(payload: WorkspacePayload, title?: string): Promise<WorkspaceSummary> {
    const normalized = normalizeWorkspacePayload(payload);
    if (this.usePrisma()) {
      const item = await this.prismaStore.create(
        title ?? normalized.storyboard?.title ?? '导入的工作区',
      );
      return this.prismaStore.save(item.id, normalized);
    }
    const item = await this.create(title ?? normalized.storyboard?.title ?? '导入的工作区');
    return this.save(item.id, normalized);
  }
}
