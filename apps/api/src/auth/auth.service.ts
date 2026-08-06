import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RefreshPayload } from './auth.types';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
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
   * Returns the user on success. Wrong password, unknown email, and a
   * deactivated account all raise the same 401 so the endpoint does not reveal
   * which emails exist.
   */
  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const invalid = new UnauthorizedException('Email atau password salah, atau akun nonaktif.');
    if (!user || !user.isActive) throw invalid;

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw invalid;

    return user;
  }

  /** TTLs arrive from the environment as plain strings ("15m", "7d"). */
  private ttl(key: string, fallback: string): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>(key) ?? fallback) as JwtSignOptions['expiresIn'];
  }

  issueTokens(user: Pick<User, 'id' | 'email' | 'role' | 'refreshTokenVersion'>): AuthTokens {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    return {
      accessToken: this.jwt.sign(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl('JWT_ACCESS_TTL', '15m'),
      }),
      refreshToken: this.jwt.sign(
        { sub: user.id, ver: user.refreshTokenVersion } satisfies RefreshPayload,
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.ttl('JWT_REFRESH_TTL', '7d'),
        },
      ),
    };
  }

  /**
   * Exchanges a refresh token for a fresh pair. The user is re-read from the
   * database every time, so an account deactivated mid-session cannot renew.
   * The token's `ver` claim must match the user's current
   * `refreshTokenVersion` — logout() bumps that counter, which invalidates
   * every refresh token issued before it even though their signature and
   * `exp` are still technically valid.
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

    return { user, tokens: this.issueTokens(user) };
  }

  /**
   * Called on logout. Best-effort: if the cookie is missing, malformed, or
   * already expired there is nothing meaningful to invalidate (an unusable
   * token needs no revocation), so this never throws — logout always
   * succeeds from the client's point of view.
   */
  async invalidateSession(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    let sub: string;
    try {
      const payload = this.jwt.verify<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      sub = payload.sub;
    } catch {
      return;
    }

    await this.prisma.user
      .update({ where: { id: sub }, data: { refreshTokenVersion: { increment: 1 } } })
      .catch(() => undefined);
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Akun tidak ditemukan atau nonaktif.');
    }
    return user;
  }
}
