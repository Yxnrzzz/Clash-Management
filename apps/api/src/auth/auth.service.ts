import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.types';

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

  issueTokens(user: Pick<User, 'id' | 'email' | 'role'>): AuthTokens {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    return {
      accessToken: this.jwt.sign(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl('JWT_ACCESS_TTL', '15m'),
      }),
      refreshToken: this.jwt.sign(
        { sub: user.id },
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
   */
  async refresh(refreshToken: string | undefined): Promise<{ user: User; tokens: AuthTokens }> {
    const invalid = new UnauthorizedException('Sesi tidak valid atau sudah berakhir.');
    if (!refreshToken) throw invalid;

    let sub: string;
    try {
      const payload = this.jwt.verify<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      sub = payload.sub;
    } catch {
      throw invalid;
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.isActive) throw invalid;

    return { user, tokens: this.issueTokens(user) };
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Akun tidak ditemukan atau nonaktif.');
    }
    return user;
  }
}
