import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomUUID } from 'crypto';
import ms from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RefreshPayload } from './auth.types';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Bounds total failed attempts against ONE account, independent of the
 * per-IP throttle on POST /auth/login (see auth.controller.ts) — a
 * distributed attacker spreading attempts across many IPs never trips the
 * per-IP limit but still hits this. */
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** Never store the raw refresh token — only its hash, so a leaked database
 * dump doesn't hand out valid sessions. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return hash(plain);
  }

  /**
   * Returns the user on success. Wrong password, unknown email, a
   * deactivated account, and a locked account all raise the same 401 so the
   * endpoint does not reveal which emails exist or which are currently
   * locked out.
   */
  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const invalid = new UnauthorizedException('Email atau password salah, atau akun nonaktif.');
    if (!user || !user.isActive) throw invalid;
    if (user.lockedUntil && user.lockedUntil > new Date()) throw invalid;

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.registerFailedLogin(user);
      throw invalid;
    }

    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return user;
  }

  /** Locks the account for LOCKOUT_DURATION_MS once MAX_FAILED_LOGIN_ATTEMPTS
   * is reached, then resets the counter — a fresh set of attempts starts
   * counting only after the lock expires, rather than extending it further. */
  private async registerFailedLogin(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: locked ? 0 : attempts,
        ...(locked ? { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) } : {}),
      },
    });
  }

  /** TTLs arrive from the environment as plain strings ("15m", "7d"). */
  private ttl(key: string, fallback: string): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>(key) ?? fallback) as JwtSignOptions['expiresIn'];
  }

  private refreshTtlMs(): number {
    return ms((this.config.get<string>('JWT_REFRESH_TTL') ?? '7d') as ms.StringValue);
  }

  /**
   * Issues a fresh access/refresh pair and records the refresh token's hash
   * as a RefreshSession row. When `replaces` names an existing session, that
   * row is atomically marked revoked (and pointed at the new one) in the
   * same transaction — this is what makes refresh() a true rotation instead
   * of just minting a second valid token alongside the old one.
   */
  private async mintTokens(
    user: Pick<User, 'id' | 'email' | 'role' | 'refreshTokenVersion'>,
    replaces?: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.ttl('JWT_ACCESS_TTL', '15m'),
    });
    const refreshToken = this.jwt.sign(
      { sub: user.id, ver: user.refreshTokenVersion, jti: randomUUID() } satisfies RefreshPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.ttl('JWT_REFRESH_TTL', '7d'),
      },
    );

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      });
      if (replaces) {
        await tx.refreshSession.update({
          where: { id: replaces },
          data: { revokedAt: new Date(), replacedById: created.id },
        });
      }
    });

    return { accessToken, refreshToken };
  }

  issueTokens(user: Pick<User, 'id' | 'email' | 'role' | 'refreshTokenVersion'>): Promise<AuthTokens> {
    return this.mintTokens(user);
  }

  /**
   * Exchanges a refresh token for a fresh, rotated pair. The user is
   * re-read from the database every time, so an account deactivated
   * mid-session cannot renew. The token's `ver` claim must match the user's
   * current `refreshTokenVersion` — a global "sign out everywhere" bump
   * invalidates every refresh token issued before it even though their
   * signature and `exp` are still technically valid.
   *
   * Beyond that, each refresh token maps to exactly one RefreshSession row.
   * A token with no matching row predates RefreshSession tracking (issued
   * before this feature existed) and is honored once, as a one-time bridge.
   * A token whose row is already `revokedAt` means this exact token was
   * already exchanged once before — reuse of an already-rotated token is
   * the signature of a stolen token being replayed after the legitimate
   * client moved on, so every session for that user is burned rather than
   * just rejecting this one request.
   */
  async refresh(refreshToken: string | undefined): Promise<{ user: User; tokens: AuthTokens }> {
    const invalid = new UnauthorizedException('Sesi tidak valid atau sudah berakhir.');
    if (!refreshToken) throw invalid;

    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw invalid;
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw invalid;
    if (user.refreshTokenVersion !== payload.ver) throw invalid;

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (session) {
      if (session.revokedAt) {
        await this.revokeAllSessions(user.id);
        throw invalid;
      }
      if (session.expiresAt < new Date()) throw invalid;
    }

    const tokens = await this.mintTokens(user, session?.id);
    return { user, tokens };
  }

  /**
   * Called on logout. Revokes only the session tied to this specific refresh
   * token — signing out on one device must not sign out every other device.
   * Best-effort: if the cookie is missing, malformed, or already expired
   * there is nothing meaningful to invalidate, so this never throws — logout
   * always succeeds from the client's point of view.
   */
  async invalidateSession(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    try {
      this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return;
    }

    await this.prisma.refreshSession
      .updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** Emergency "sign out everywhere": revokes every live session and bumps
   * refreshTokenVersion so even a refresh token issued before this call
   * (and therefore untracked by any RefreshSession row) is rejected too. */
  private async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { refreshTokenVersion: { increment: 1 } },
      }),
    ]);
  }

  /**
   * Changing your password revokes every other session — if the password
   * was changed because it leaked, whoever had it should not keep a live
   * session just because they grabbed it before this call.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Akun tidak ditemukan atau nonaktif.');
    }

    const ok = await verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException('Password saat ini salah.');

    if (currentPassword === newPassword) {
      throw new BadRequestException('Password baru harus berbeda dari password saat ini.');
    }

    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          refreshTokenVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Akun tidak ditemukan atau nonaktif.');
    }
    return user;
  }
}
