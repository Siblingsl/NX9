import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { WorkspacePayload, WorkspaceSummary } from '@nx9/shared';
import { normalizeWorkspacePayload } from '@nx9/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PrismaWorkspaceStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private toSummary(row: {
    id: string;
    title: string;
    blockCount: number;
    shotCount: number;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
  }): WorkspaceSummary {
    return {
      id: row.id,
      title: row.title,
      blockCount: row.blockCount,
      shotCount: row.shotCount,
      ownerId: row.ownerId,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async list(ownerId?: string): Promise<WorkspaceSummary[]> {
    const rows = await this.prisma.workspace.findMany({
      where: ownerId ? { ownerId } : undefined,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async create(title?: string, ownerId?: string): Promise<WorkspaceSummary> {
    const owner = ownerId
      ? await this.users.get(ownerId)
      : await this.users.ensureDefault();
    const now = Date.now();
    const id = `ws-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = normalizeWorkspacePayload({
      blocks: [],
      links: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      nextBlockIndex: 1,
    });
    const row = await this.prisma.workspace.create({
      data: {
        id,
        title: title?.trim() || '未命名工作区',
        ownerId: owner.id,
        payload: JSON.stringify(payload),
        blockCount: 0,
        shotCount: 0,
      },
    });
    return this.toSummary(row);
  }

  async load(id: string): Promise<WorkspacePayload> {
    const row = await this.prisma.workspace.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Workspace ${id} not found`);
    return normalizeWorkspacePayload(JSON.parse(row.payload) as Partial<WorkspacePayload>);
  }

  async save(id: string, payload: WorkspacePayload): Promise<WorkspaceSummary> {
    const row = await this.prisma.workspace.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Workspace ${id} not found`);

    const normalized = normalizeWorkspacePayload(payload);
    const existing = JSON.parse(row.payload) as Partial<WorkspacePayload>;
    const incomingEmpty =
      normalized.blocks.length === 0 &&
      normalized.links.length === 0 &&
      (normalized.storyboard?.shots?.length ?? 0) === 0;
    const existingHasContent =
      (existing.blocks?.length ?? 0) > 0 ||
      (existing.links?.length ?? 0) > 0 ||
      (existing.storyboard?.shots?.length ?? 0) > 0;
    if (incomingEmpty && existingHasContent) {
      throw new BadRequestException('Refusing to overwrite non-empty workspace with empty payload');
    }

    const updated = await this.prisma.workspace.update({
      where: { id },
      data: {
        payload: JSON.stringify(normalized),
        blockCount: normalized.blocks.length,
        shotCount: normalized.storyboard?.shots?.length ?? 0,
      },
    });
    return this.toSummary(updated);
  }

  async rename(id: string, title: string): Promise<WorkspaceSummary> {
    const row = await this.prisma.workspace.update({
      where: { id },
      data: { title: title.trim() || undefined },
    });
    return this.toSummary(row);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.workspace.delete({ where: { id } }).catch(() => {
      throw new NotFoundException(`Workspace ${id} not found`);
    });
  }
}
