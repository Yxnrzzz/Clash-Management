import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { toUserView, UserView } from '../common/user.view';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

export interface CreatedUser extends UserView {
  /** Only present when the Admin didn't supply a password — this is the
   * caller's ONE chance to see it and hand it to the new user. Never stored
   * anywhere or retrievable again after this response. */
  temporaryPassword?: string;
}

export interface PasswordReset {
  temporaryPassword: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toUserView);
  }

  async create(dto: CreateUserDto): Promise<CreatedUser> {
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailFree(email);

    const temporaryPassword = dto.password ?? generateTemporaryPassword();
    const passwordHash = await AuthService.hashPassword(temporaryPassword);
    const user = await this.prisma.user.create({
      data: { name: dto.name.trim(), email, role: dto.role, passwordHash, mustChangePassword: true },
    });

    // Multi-project: a new account starts with no project membership at all.
    // An Admin must assign it to specific projects via
    // POST /projects/:projectId/members (see ProjectsController).
    return {
      ...toUserView(user),
      ...(dto.password === undefined ? { temporaryPassword } : {}),
    };
  }

  /**
   * Admin-triggered reset: issues a new random password, forces the change
   * gate, and revokes every live session for the account — the same
   * "assume the old password/sessions may be compromised" posture as a
   * self-service change (see AuthService.changePassword).
   */
  async resetPassword(id: string): Promise<PasswordReset> {
    await this.getOrThrow(id);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await AuthService.hashPassword(temporaryPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          refreshTokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { temporaryPassword };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserView> {
    await this.getOrThrow(id);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      await this.assertEmailFree(email, id);
      data.email = email;
    }

    return toUserView(await this.prisma.user.update({ where: { id }, data }));
  }

  async setActive(id: string, isActive: boolean): Promise<UserView> {
    await this.getOrThrow(id);
    return toUserView(await this.prisma.user.update({ where: { id }, data: { isActive } }));
  }

  private async getOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');
    return user;
  }

  private async assertEmailFree(email: string, exceptId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Email sudah digunakan user lain');
    }
  }
}

/** 16 URL-safe characters (~96 bits of entropy) — always satisfies
 * CreateUserDto's own MinLength(12) so an Admin-generated password never
 * fails the policy it's exempt from typing in. */
function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}
