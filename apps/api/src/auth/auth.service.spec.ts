import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const PASSWORD = 'demo1234';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-eng',
    name: 'Dimas Prasetyo',
    email: 'engineer@clashhub.dev',
    passwordHash: '',
    role: Role.ENGINEER,
    isActive: true,
    refreshTokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService(user: User | null, updateMock = jest.fn().mockResolvedValue(user)) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: updateMock },
  } as unknown as PrismaService;

  const config = {
    getOrThrow: (key: string) => `secret-${key}`,
    get: () => '15m',
  } as unknown as ConfigService;

  return new AuthService(prisma, new JwtService({}), config);
}

describe('AuthService.validateUser', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
  });

  it('returns the user when the password matches', async () => {
    const user = makeUser({ passwordHash });
    const service = makeService(user);

    await expect(service.validateUser(user.email, PASSWORD)).resolves.toMatchObject({
      id: 'u-eng',
      email: 'engineer@clashhub.dev',
    });
  });

  it('matches regardless of email casing and surrounding whitespace', async () => {
    const service = makeService(makeUser({ passwordHash }));
    await expect(service.validateUser('  ENGINEER@clashhub.dev ', PASSWORD)).resolves.toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const service = makeService(makeUser({ passwordHash }));
    await expect(service.validateUser('engineer@clashhub.dev', 'salah')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email', async () => {
    const service = makeService(null);
    await expect(service.validateUser('hantu@clashhub.dev', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a deactivated account even with the right password', async () => {
    const service = makeService(makeUser({ passwordHash, isActive: false }));
    await expect(service.validateUser('engineer@clashhub.dev', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('AuthService.issueTokens', () => {
  it('signs an access token carrying the user id, email and role', () => {
    const service = makeService(null);
    const user = makeUser({ role: Role.COORDINATOR });

    const { accessToken, refreshToken } = service.issueTokens(user);
    const jwt = new JwtService({});

    expect(jwt.decode(accessToken)).toMatchObject({
      sub: user.id,
      email: user.email,
      role: Role.COORDINATOR,
    });
    // The refresh token deliberately carries only the subject and the
    // version it was issued with — no PII, no role.
    expect(jwt.decode(refreshToken)).toMatchObject({ sub: user.id, ver: user.refreshTokenVersion });
    expect(jwt.decode(refreshToken)).not.toHaveProperty('role');
  });
});

describe('AuthService.refresh', () => {
  it('issues a fresh pair when the token version matches the user', async () => {
    const user = makeUser({ refreshTokenVersion: 2 });
    const service = makeService(user);
    const { refreshToken } = service.issueTokens(user);

    await expect(service.refresh(refreshToken)).resolves.toMatchObject({ user });
  });

  it('rejects a refresh token whose version predates the user\'s current one', async () => {
    // Simulates a stolen/old token: it was issued while the user's version
    // was 0, but the user has since logged out (bumping it to 1).
    const staleToken = makeService(null).issueTokens(makeUser({ refreshTokenVersion: 0 }))
      .refreshToken;
    const service = makeService(makeUser({ refreshTokenVersion: 1 }));

    await expect(service.refresh(staleToken)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a missing token', async () => {
    const service = makeService(null);
    await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.invalidateSession', () => {
  it('increments the refresh token version for the token\'s subject', async () => {
    const user = makeUser({ refreshTokenVersion: 0 });
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const service = makeService(user, updateMock);
    const { refreshToken } = service.issueTokens(user);

    await service.invalidateSession(refreshToken);

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { refreshTokenVersion: { increment: 1 } },
    });
  });

  it('is a no-op (does not throw) for a missing or invalid token', async () => {
    const updateMock = jest.fn();
    const service = makeService(null, updateMock);

    await expect(service.invalidateSession(undefined)).resolves.toBeUndefined();
    await expect(service.invalidateSession('not-a-real-token')).resolves.toBeUndefined();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
