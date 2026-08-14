import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { UserSummary } from '@nx9/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** 会话有效期：记住本机 = 90 天 */
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** 密码最短长度 */
export const PASSWORD_MIN_LENGTH = 6;

export interface AuthResult {
  token: string;
  user: UserSummary;
  /** 首登自动接管旧「默认用户」数据时为 true */
  adoptedLegacy: boolean;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  createdAt: number;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /* ── 密码哈希（scrypt，salt:hash hex） ── */
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  /* ── 会话 token（库中仅存 sha256） ── */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private newToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async issueSession(userId: string): Promise<string> {
    const token = this.newToken();
    await this.prisma.authSession.create({
      data: {
        tokenHash: this.hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return token;
  }

  private toPublic(user: {
    id: string;
    name: string;
    email: string | null;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.getTime(),
    };
  }

  /**
   * 注册账户。
   * 首登接管：若库中仍存在未设置密码的旧用户（如自动创建的「默认用户」），
   * 则复用该记录（改名 + 设置密码），名下工作区与用量数据自然延续。
   */
  async register(name: string, password: string): Promise<AuthResult> {
    const clean = (name ?? '').trim();
    if (!clean) throw new BadRequestException('昵称不能为空');
    if (clean.length > 24) throw new BadRequestException('昵称最长 24 个字符');
    if (!password || password.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(`密码至少 ${PASSWORD_MIN_LENGTH} 位`);
    }

    const passwordHash = this.hashPassword(password);

    // 首登接管：找最早的未设密码用户
    const legacy = await this.prisma.user.findFirst({
      where: { passwordHash: null },
      orderBy: { createdAt: 'asc' },
    });
    if (legacy) {
      // 目标昵称不能与其它已设密码用户冲突
      const clash = await this.prisma.user.findFirst({
        where: { name: clean, id: { not: legacy.id } },
      });
      if (clash) throw new ConflictException('该昵称已被占用');
      const user = await this.prisma.user.update({
        where: { id: legacy.id },
        data: { name: clean, passwordHash },
      });
      const token = await this.issueSession(user.id);
      return { token, user: this.toPublic(user), adoptedLegacy: true };
    }

    const clash = await this.prisma.user.findFirst({ where: { name: clean } });
    if (clash) throw new ConflictException('该昵称已被占用');
    const user = await this.prisma.user.create({
      data: { name: clean, passwordHash },
    });
    const token = await this.issueSession(user.id);
    return { token, user: this.toPublic(user), adoptedLegacy: false };
  }

  async login(name: string, password: string): Promise<AuthResult> {
    const clean = (name ?? '').trim();
    if (!clean || !password) throw new BadRequestException('请输入昵称和密码');
    const user = await this.prisma.user.findUnique({ where: { name: clean } });
    if (!user?.passwordHash || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('昵称或密码不正确');
    }
    const token = await this.issueSession(user.id);
    return { token, user: this.toPublic(user), adoptedLegacy: false };
  }

  async me(token: string): Promise<PublicUser> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return this.toPublic(session.user);
  }

  async logout(token: string): Promise<{ ok: boolean }> {
    if (!token) return { ok: true };
    await this.prisma.authSession.deleteMany({
      where: { tokenHash: this.hashToken(token) },
    });
    return { ok: true };
  }
}
