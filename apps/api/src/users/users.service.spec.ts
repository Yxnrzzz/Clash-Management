import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'existing-hash',
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

/** Mirrors Prisma's `{ increment }` update helper — the only non-literal
 * update value UsersService writes (refreshTokenVersion, in resetPassword). */
function applyPrismaData(user: User, data: Record<string, unknown>): User {
  const result: Record<string, unknown> = { ...user };
  for (const [key, value] of Object.entries(data)) {
    result[key] =
      value && typeof value === 'object' && 'increment' in (value as object)
        ? ((user as Record<string, unknown>)[key] as number) + (value as { increment: number }).increment
        : value;
  }
  return result as User;
}

function makePrisma(users: User[] = [], memberships: { projectId: string; userId: string }[] = []) {
  const store = new Map(users.map((u) => [u.id, u]));
  let nextId = 1;

  const prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    projectMember: { findMany: jest.Mock };
    refreshSession: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  } = {
    user: {
      findMany: jest.fn(({ where }: { where?: { projectMemberships?: { some: { projectId: { in: string[] } } } } } = {}) => {
        const allUsers = [...store.values()];
        const projectIds = where?.projectMemberships?.some.projectId.in;
        if (!projectIds) return Promise.resolve(allUsers);
        const memberUserIds = new Set(
          memberships.filter((m) => projectIds.includes(m.projectId)).map((m) => m.userId),
        );
        return Promise.resolve(allUsers.filter((u) => memberUserIds.has(u.id)));
      }),
      findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          where.id
            ? (store.get(where.id) ?? null)
            : ([...store.values()].find((u) => u.email === where.email) ?? null),
        ),
      ),
      create: jest.fn(({ data }: { data: Partial<User> }) => {
        const user = makeUser({ id: `new-${nextId++}`, mustChangePassword: false, ...data });
        store.set(user.id, user);
        return Promise.resolve(user);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const user = store.get(where.id);
        if (!user) throw new Error('user not found');
        const updated = applyPrismaData(user, data);
        store.set(where.id, updated);
        return Promise.resolve(updated);
      }),
    },
    projectMember: {
      findMany: jest.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(memberships.filter((m) => m.userId === where.userId).map((m) => ({ projectId: m.projectId }))),
      ),
    },
    refreshSession: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    $transaction: jest.fn((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return { prisma: prisma as unknown as PrismaService, store };
}

describe('UsersService.create', () => {
  it('generates a random temporary password and returns it once, when the caller supplies none', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma);

    const result = await service.create({ name: 'Budi', email: 'budi@test.dev', role: Role.ENGINEER });

    expect(result.temporaryPassword).toBeDefined();
    expect(result.temporaryPassword!.length).toBeGreaterThanOrEqual(12);
    expect(result.mustChangePassword).toBe(true);
    // toUserView's own shape proves passwordHash never leaves the service —
    // this just double-checks nothing slipped through as an extra field.
    expect(Object.keys(result)).not.toContain('passwordHash');
  });

  it('does not return a temporaryPassword when the caller supplies their own password', async () => {
    const { prisma } = makePrisma();
    const service = new UsersService(prisma);

    const result = await service.create({
      name: 'Citra',
      email: 'citra@test.dev',
      role: Role.ENGINEER,
      password: 'ExplicitPassword123',
    });

    expect(result.temporaryPassword).toBeUndefined();
    // Still forced through the change gate — an Admin-chosen password is
    // not assumed to be one only the new user knows.
    expect(result.mustChangePassword).toBe(true);
  });

  it('rejects a duplicate email', async () => {
    const { prisma } = makePrisma([makeUser({ id: 'u1', email: 'dupe@test.dev' })]);
    const service = new UsersService(prisma);

    await expect(
      service.create({ name: 'Lain', email: 'dupe@test.dev', role: Role.ENGINEER }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('UsersService.resetPassword', () => {
  it('issues a new random password, forces the change gate, clears lockout state, and revokes sessions', async () => {
    const user = makeUser({
      id: 'u1',
      mustChangePassword: false,
      failedLoginAttempts: 4,
      lockedUntil: new Date(Date.now() + 60_000),
      refreshTokenVersion: 2,
    });
    const { prisma, store } = makePrisma([user]);
    const service = new UsersService(prisma);

    const { temporaryPassword } = await service.resetPassword('u1');

    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);

    const updated = store.get('u1')!;
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.passwordChangedAt).not.toBeNull();
    expect(updated.refreshTokenVersion).toBe(3);
    expect(updated.failedLoginAttempts).toBe(0);
    expect(updated.lockedUntil).toBeNull();
    expect(updated.passwordHash).not.toBe(user.passwordHash);

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('throws for an unknown user id', async () => {
    const { prisma } = makePrisma([]);
    const service = new UsersService(prisma);

    await expect(service.resetPassword('ghost')).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.findAll — directory scoping', () => {
  const admin: AuthUser = { id: 'u-admin', email: 'admin@x.dev', role: Role.ADMIN };
  const engineer: AuthUser = { id: 'u-eng', email: 'eng@x.dev', role: Role.ENGINEER };
  const otherEngineer: AuthUser = { id: 'u-eng-2', email: 'eng2@x.dev', role: Role.ENGINEER };
  const strangerEngineer: AuthUser = { id: 'u-eng-3', email: 'eng3@x.dev', role: Role.ENGINEER };

  const users = [
    makeUser({ id: admin.id, role: Role.ADMIN }),
    makeUser({ id: engineer.id, role: Role.ENGINEER }),
    makeUser({ id: otherEngineer.id, role: Role.ENGINEER }),
    makeUser({ id: strangerEngineer.id, role: Role.ENGINEER }),
  ];
  const memberships = [
    { projectId: 'proj-1', userId: engineer.id },
    { projectId: 'proj-1', userId: otherEngineer.id },
    { projectId: 'proj-2', userId: strangerEngineer.id },
  ];

  it('returns the full directory for a cross-project role (Admin/Management/Coordinator)', async () => {
    const { prisma } = makePrisma(users, memberships);
    const service = new UsersService(prisma);

    const result = await service.findAll(admin);
    expect(result.map((u) => u.id).sort()).toEqual(users.map((u) => u.id).sort());
  });

  it('scopes an Engineer to users who share at least one project with them', async () => {
    const { prisma } = makePrisma(users, memberships);
    const service = new UsersService(prisma);

    const result = await service.findAll(engineer);
    expect(result.map((u) => u.id).sort()).toEqual([engineer.id, otherEngineer.id].sort());
    expect(result.some((u) => u.id === strangerEngineer.id)).toBe(false);
  });

  it('returns an empty list for an Engineer with no project membership at all', async () => {
    const { prisma } = makePrisma(users, memberships);
    const service = new UsersService(prisma);

    const newUser: AuthUser = { id: 'u-eng-new', email: 'new@x.dev', role: Role.ENGINEER };
    const result = await service.findAll(newUser);
    expect(result).toEqual([]);
  });
});
