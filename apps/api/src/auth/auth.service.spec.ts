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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService(user: User | null) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
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
    // The refresh token deliberately carries only the subject.
    expect(jwt.decode(refreshToken)).toMatchObject({ sub: user.id });
    expect(jwt.decode(refreshToken)).not.toHaveProperty('role');
  });
});
