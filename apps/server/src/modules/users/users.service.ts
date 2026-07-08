import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserSummary } from '@nx9/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserSummary[]> {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.getTime(),
    }));
  }

  async create(name: string, email?: string): Promise<UserSummary> {
    const user = await this.prisma.user.create({
      data: { name: name.trim() || '用户', email: email?.trim() || null },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.getTime(),
    };
  }

  async get(id: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.getTime(),
    };
  }

  async ensureDefault(): Promise<UserSummary> {
    const existing = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        createdAt: existing.createdAt.getTime(),
      };
    }
    return this.create('默认用户');
  }
}
