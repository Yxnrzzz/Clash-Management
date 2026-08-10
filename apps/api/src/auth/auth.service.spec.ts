import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const PASSWORD = 'demo1234-local-dev-only';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-eng',
    name: 'Dimas Prasetyo',
    email: 'engineer@clashhub.dev',
    passwordHash: '',
    role: Role.ENGINEER,
    isActive: true,
    refreshTokenVersion: 0,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface FakeSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/**
 * A small in-memory stand-in for PrismaService's `user` and
 * `refreshSession` models. Real enough that AuthService's actual
 * create/find/update/transaction call sequence exercises real state
 * transitions (a session minted, then later found revoked by a second
 * call, etc.) instead of every assertion needing its own bespoke
 * jest.fn() wiring — the rotation/reuse-detection behavior under test is
 * exactly the kind of multi-step state machine that a fully mocked prisma
 * would make easy to test-drive into a false pass.
 */
class FakePrisma {
  users = new Map<string, User>();
  sessions = new Map<string, FakeSession>();
  private nextSessionId = 1;

  user = {
    findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) => {
      const found = where.id
        ? this.users.get(where.id)
        : [...this.users.values()].find((u) => u.email === where.email);
      return Promise.resolve(found ?? null);
    }),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const user = this.users.get(where.id);
      if (!user) throw new Error('user not found');
      const updated = { ...user, ...applyPrismaData(user, data) } as User;
      this.users.set(where.id, updated);
      return Promise.resolve(updated);
    }),
  };

  refreshSession = {
    create: jest.fn(({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
      const id = `session-${this.nextSessionId++}`;
      const session: FakeSession = { id, revokedAt: null, replacedById: null, ...data };
      this.sessions.set(id, session);
      return Promise.resolve(session);
    }),
    findUnique: jest.fn(({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
      Promise.resolve([...this.sessions.values()].find((s) => s.tokenHash === tokenHash) ?? null),
    ),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const session = this.sessions.get(where.id);
      if (!session) throw new Error('session not found');
      const updated = { ...session, ...data } as FakeSession;
      this.sessions.set(where.id, updated);
      return Promise.resolve(updated);
    }),
    // Matches on every field present in `where` — callers use this with
    // different filter shapes (by tokenHash for a single session in
    // invalidateSession, by userId+revokedAt:null for "every live session"
    // in revokeAllSessions/changePassword), and a real Prisma `updateMany`
    // honors whichever fields are actually given.
    updateMany: jest.fn(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const [id, session] of this.sessions) {
        const matches = Object.entries(where).every(
          ([key, value]) => (session as unknown as Record<string, unknown>)[key] === value,
        );
        if (matches) {
          this.sessions.set(id, { ...session, ...data } as FakeSession);
          count++;
        }
      }
      return Promise.resolve({ count });
    }),
  };

  $transaction = jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: FakePrisma) => Promise<unknown>)(this);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
}

/** Mirrors Prisma's `{ increment }` update helper, the only non-literal
 * update value AuthService writes (refreshTokenVersion). */
function applyPrismaData(user: User, data: Record<string, unknown>): Partial<User> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as object)) {
      result[key] = ((user as Record<string, unknown>)[key] as number) + (value as { increment: number }).increment;
    } else {
      result[key] = value;
    }
  }
  return result as Partial<User>;
}

function makeService(prisma: FakePrisma): AuthService {
  const config = {
    getOrThrow: (key: string) => `secret-${key}`,
    get: () => undefined,
  } as unknown as ConfigService;
  return new AuthService(prisma as unknown as PrismaService, new JwtService({}), config);
}

function makeServiceWithUser(user: User | null): { service: AuthService; prisma: FakePrisma } {
  const prisma = new FakePrisma();
  if (user) prisma.users.set(user.id, user);
  return { service: makeService(prisma), prisma };
}

describe('AuthService.validateUser', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
  });

  it('returns the user when the password matches', async () => {
    const user = makeUser({ passwordHash });
    const { service } = makeServiceWithUser(user);

    await expect(service.validateUser(user.email, PASSWORD)).resolves.toMatchObject({
      id: 'u-eng',
      email: 'engineer@clashhub.dev',
    });
  });

  it('matches regardless of email casing and surrounding whitespace', async () => {
    const { service } = makeServiceWithUser(makeUser({ passwordHash }));
    await expect(service.validateUser('  ENGINEER@clashhub.dev ', PASSWORD)).resolves.toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const { service } = makeServiceWithUser(makeUser({ passwordHash }));
    await expect(service.validateUser('engineer@clashhub.dev', 'salah')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email', async () => {
    const { service } = makeServiceWithUser(null);
    await expect(service.validateUser('hantu@clashhub.dev', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a deactivated account even with the right password', async () => {
    const { service } = makeServiceWithUser(makeUser({ passwordHash, isActive: false }));
    await expect(service.validateUser('engineer@clashhub.dev', PASSWORD)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('resets the failed-attempt counter after a successful login', async () => {
    const user = makeUser({ passwordHash, failedLoginAttempts: 3 });
    const { service, prisma } = makeServiceWithUser(user);

    await service.validateUser(user.email, PASSWORD);

    expect(prisma.users.get(user.id)?.failedLoginAttempts).toBe(0);
  });

  it('locks the account for 15 minutes after 10 consecutive failed attempts, rejecting even a correct password meanwhile', async () => {
    const user = makeUser({ passwordHash });
    const { service, prisma } = makeServiceWithUser(user);

    for (let i = 0; i < 10; i++) {
      await expect(service.validateUser(user.email, 'salah')).rejects.toThrow(UnauthorizedException);
    }

    const locked = prisma.users.get(user.id);
    expect(locked?.lockedUntil).not.toBeNull();
    expect(locked?.failedLoginAttempts).toBe(0);

    // Locked out even with the right password — and with the SAME
    // exception the wrong-password path throws, so a locked account isn't
    // distinguishable from a simple bad guess.
    await expect(service.validateUser(user.email, PASSWORD)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.issueTokens', () => {
  it('signs an access/refresh pair and records a matching RefreshSession row', async () => {
    const { service, prisma } = makeServiceWithUser(null);
    const user = makeUser({ role: Role.COORDINATOR });

    const { accessToken, refreshToken } = await service.issueTokens(user);
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

    expect(prisma.sessions.size).toBe(1);
    const [session] = [...prisma.sessions.values()];
    expect(session.userId).toBe(user.id);
    expect(session.tokenHash).toBe(hashToken(refreshToken));
    expect(session.revokedAt).toBeNull();
  });
});

describe('AuthService.refresh', () => {
  it('issues a rotated pair when the token version matches the user, revoking the old session', async () => {
    const user = makeUser({ refreshTokenVersion: 2 });
    const { service, prisma } = makeServiceWithUser(user);
    const { refreshToken } = await service.issueTokens(user);

    const result = await service.refresh(refreshToken);

    expect(result.user).toMatchObject({ id: user.id });
    expect(result.tokens.refreshToken).not.toBe(refreshToken);

    const oldSession = [...prisma.sessions.values()].find((s) => s.tokenHash === hashToken(refreshToken));
    const newSession = [...prisma.sessions.values()].find(
      (s) => s.tokenHash === hashToken(result.tokens.refreshToken),
    );
    expect(oldSession?.revokedAt).not.toBeNull();
    expect(newSession).toBeTruthy();
    expect(oldSession?.replacedById).toBe(newSession?.id);
  });

  it("rejects a refresh token whose version predates the user's current one", async () => {
    // Simulates a stolen/old token: it was issued while the user's version
    // was 0, but the user has since triggered a global sign-out (bumping
    // it to 1).
    const stale = makeUser({ refreshTokenVersion: 0 });
    const { service: staleIssuer } = makeServiceWithUser(stale);
    const { refreshToken: staleToken } = await staleIssuer.issueTokens(stale);

    const { service } = makeServiceWithUser(makeUser({ refreshTokenVersion: 1 }));
    await expect(service.refresh(staleToken)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a missing token', async () => {
    const { service } = makeServiceWithUser(null);
    await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('honors a refresh token with no RefreshSession row as a one-time bridge for pre-migration tokens', async () => {
    const user = makeUser({ refreshTokenVersion: 0 });
    const { service } = makeServiceWithUser(user);
    // Signed directly (bypassing issueTokens), so no RefreshSession row
    // was ever created for it — simulates a token issued before this
    // feature existed.
    const bareToken = new JwtService({}).sign(
      { sub: user.id, ver: 0 },
      { secret: 'secret-JWT_REFRESH_SECRET' },
    );

    await expect(service.refresh(bareToken)).resolves.toMatchObject({ user: { id: user.id } });
  });

  it('detects reuse of an already-rotated refresh token and revokes every session for that user', async () => {
    const user = makeUser({ refreshTokenVersion: 0 });
    const { service, prisma } = makeServiceWithUser(user);
    const { refreshToken: first } = await service.issueTokens(user);

    // Legitimate rotation: `first` is now revoked, replaced by `second`.
    const { tokens: second } = await service.refresh(first);

    // Reuse of the already-rotated `first` token — the signature of a
    // stolen token being replayed after the real client moved on.
    await expect(service.refresh(first)).rejects.toThrow(UnauthorizedException);

    const secondSession = [...prisma.sessions.values()].find(
      (s) => s.tokenHash === hashToken(second.refreshToken),
    );
    expect(secondSession?.revokedAt).not.toBeNull();
    expect(prisma.users.get(user.id)?.refreshTokenVersion).toBe(1);
  });
});

describe('AuthService.invalidateSession', () => {
  it('revokes only the session tied to the given refresh token, leaving other sessions live', async () => {
    const user = makeUser();
    const { service, prisma } = makeServiceWithUser(user);
    const { refreshToken: tokenA } = await service.issueTokens(user);
    const { refreshToken: tokenB } = await service.issueTokens(user);

    await service.invalidateSession(tokenA);

    const sessionA = [...prisma.sessions.values()].find((s) => s.tokenHash === hashToken(tokenA));
    const sessionB = [...prisma.sessions.values()].find((s) => s.tokenHash === hashToken(tokenB));
    expect(sessionA?.revokedAt).not.toBeNull();
    expect(sessionB?.revokedAt).toBeNull();
  });

  it('is a no-op (does not throw) for a missing or invalid token', async () => {
    const { service } = makeServiceWithUser(null);

    await expect(service.invalidateSession(undefined)).resolves.toBeUndefined();
    await expect(service.invalidateSession('not-a-real-token')).resolves.toBeUndefined();
  });
});

describe('AuthService.changePassword', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD);
  });

  it('updates the password, clears mustChangePassword, and revokes every live session', async () => {
    const user = makeUser({ passwordHash, mustChangePassword: true, refreshTokenVersion: 0 });
    const { service, prisma } = makeServiceWithUser(user);
    const { refreshToken } = await service.issueTokens(user);

    await service.changePassword(user.id, PASSWORD, 'PasswordBaru123');

    const updated = prisma.users.get(user.id);
    expect(updated?.mustChangePassword).toBe(false);
    expect(updated?.passwordChangedAt).not.toBeNull();
    expect(updated?.refreshTokenVersion).toBe(1);
    expect(updated?.passwordHash).not.toBe(passwordHash);

    const session = [...prisma.sessions.values()].find((s) => s.tokenHash === hashToken(refreshToken));
    expect(session?.revokedAt).not.toBeNull();
  });

  it('rejects a wrong current password', async () => {
    const user = makeUser({ passwordHash });
    const { service } = makeServiceWithUser(user);

    await expect(service.changePassword(user.id, 'salah-sekali', 'PasswordBaru123')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a new password identical to the current one', async () => {
    const user = makeUser({ passwordHash });
    const { service } = makeServiceWithUser(user);

    await expect(service.changePassword(user.id, PASSWORD, PASSWORD)).rejects.toThrow(
      BadRequestException,
    );
  });
});
