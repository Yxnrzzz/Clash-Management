import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';

const ACTOR: AuthUser = { id: 'u-admin', email: 'admin@eps.dev', role: 'ADMIN' } as AuthUser;

function makeStorage() {
  return { delete: jest.fn().mockResolvedValue(undefined) } as unknown as StorageService;
}

function makePrisma(existingCodes: string[] = []) {
  const project = {
    findUnique: jest.fn(({ where: { code } }: { where: { code: string } }) =>
      Promise.resolve(existingCodes.includes(code) ? { id: 'existing', code } : null),
    ),
    create: jest.fn(({ data }: { data: { name: string; code: string } }) =>
      Promise.resolve({ id: 'proj-new', archivedAt: null, ...data }),
    ),
  };

  const prisma = { project } as unknown as PrismaService;
  return { prisma, project };
}

type Membership = { projectId: string; userId: string; projectRole: string; joinedAt: Date };
type FakeUser = { id: string; name: string; email: string };

/** Fixture-backed fake for the membership endpoints — mirrors the arrays-as-
 * tables style used by project-isolation.e2e-spec.ts, scaled down to just
 * the models ProjectsService.listMembers/addMember/removeMember touch. */
function makeMembershipPrisma(opts: {
  projects?: { id: string }[];
  users?: FakeUser[];
  memberships?: Membership[];
}) {
  const projects = opts.projects ?? [{ id: 'proj-1' }];
  const users = opts.users ?? [];
  const memberships = opts.memberships ?? [];

  const project = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(projects.find((p) => p.id === id) ?? null),
    ),
  };

  const user = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(users.find((u) => u.id === id) ?? null),
    ),
  };

  const projectMember = {
    findMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) =>
      Promise.resolve(
        memberships
          .filter((m) => m.projectId === projectId)
          .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
          .map((m) => ({ ...m, user: users.find((u) => u.id === m.userId)! })),
      ),
    ),
    findUnique: jest.fn(
      ({
        where: { projectId_userId },
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
      }) =>
        Promise.resolve(
          memberships.find(
            (m) =>
              m.projectId === projectId_userId.projectId && m.userId === projectId_userId.userId,
          ) ?? null,
        ),
    ),
    create: jest.fn(
      ({ data }: { data: { projectId: string; userId: string; projectRole: string } }) => {
        const created = { ...data, joinedAt: new Date() };
        memberships.push(created);
        return Promise.resolve(created);
      },
    ),
    delete: jest.fn(
      ({
        where: { projectId_userId },
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
      }) => {
        const idx = memberships.findIndex(
          (m) =>
            m.projectId === projectId_userId.projectId && m.userId === projectId_userId.userId,
        );
        const [removed] = memberships.splice(idx, 1);
        return Promise.resolve(removed);
      },
    ),
  };

  const prisma = { project, user, projectMember } as unknown as PrismaService;
  return { prisma, project, user, projectMember, memberships };
}

// --- Rich fixture fake for update()/remove()/archive()/stats() -------------

interface FakeProjectRow {
  id: string;
  name: string;
  code: string;
  archivedAt: Date | null;
}
interface FakeClashRow {
  id: string;
  projectId: string;
  disciplineId: string;
  seq: number;
  uniqueCode: string;
  deletedAt: Date | null;
}
interface FakeDisciplineRow {
  id: string;
  projectId: string;
  code: string;
}
interface FakeImportJobRow {
  id: string;
  projectId: string;
  storageKey: string;
}

/** Whether P2002 (unique violation) should be thrown from the next
 * `$executeRaw` call the rewrite transaction makes — used to test the raw
 * UPDATE's own collision backstop, independent of the pre-check. */
function makeLifecyclePrisma(opts: {
  projects?: FakeProjectRow[];
  clashes?: FakeClashRow[];
  disciplines?: FakeDisciplineRow[];
  importJobs?: FakeImportJobRow[];
  throwP2002OnExecuteRaw?: boolean;
}) {
  const projects = opts.projects ?? [];
  const clashes = opts.clashes ?? [];
  const disciplines = opts.disciplines ?? [];
  let importJobs = opts.importJobs ?? [];
  const auditRows: {
    clashId: string;
    actorId: string;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
  }[] = [];
  let projectMemberDeleted = false;
  let disciplineDeleted = false;
  let zoneDeleted = false;

  function clashMatches(c: FakeClashRow, where: Record<string, unknown>): boolean {
    if ('projectId' in where) {
      const pid = where.projectId as string | { not: string };
      if (typeof pid === 'object' && pid !== null) {
        if (c.projectId === pid.not) return false;
      } else if (c.projectId !== pid) {
        return false;
      }
    }
    if ('deletedAt' in where) {
      const d = where.deletedAt as null | { not: null };
      if (d === null && c.deletedAt !== null) return false;
      if (d !== null && typeof d === 'object' && 'not' in d && d.not === null && c.deletedAt === null) {
        return false;
      }
    }
    if ('uniqueCode' in where) {
      const uc = where.uniqueCode as { in: string[] };
      if (!uc.in.includes(c.uniqueCode)) return false;
    }
    return true;
  }

  const clashDelegate = {
    count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(clashes.filter((c) => clashMatches(c, where)).length),
    ),
    findMany: jest.fn(
      ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        let rows = clashes.filter((c) => clashMatches(c, where));
        if (take) rows = rows.slice(0, take);
        return Promise.resolve(
          rows.map((c) => ({
            ...c,
            discipline: disciplines.find((d) => d.id === c.disciplineId),
          })),
        );
      },
    ),
  };

  const projectDelegate = {
    findUnique: jest.fn(
      ({ where }: { where: { id?: string; code?: string } }) =>
        Promise.resolve(
          where.id !== undefined
            ? (projects.find((p) => p.id === where.id) ?? null)
            : (projects.find((p) => p.code === where.code) ?? null),
        ),
    ),
    update: jest.fn(({ where: { id }, data }: { where: { id: string }; data: Partial<FakeProjectRow> }) => {
      const row = projects.find((p) => p.id === id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
    delete: jest.fn(({ where: { id } }: { where: { id: string } }) => {
      const idx = projects.findIndex((p) => p.id === id);
      const [removed] = projects.splice(idx, 1);
      return Promise.resolve(removed);
    }),
  };

  const tx = {
    clash: clashDelegate,
    auditLog: {
      createMany: jest.fn(({ data }: { data: typeof auditRows }) => {
        auditRows.push(...data);
        return Promise.resolve({ count: data.length });
      }),
    },
    $executeRaw: jest.fn(() => {
      if (opts.throwP2002OnExecuteRaw) {
        throw new Prisma.PrismaClientKnownRequestError('unique violation', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      return Promise.resolve(0);
    }),
    projectMember: {
      deleteMany: jest.fn(() => {
        projectMemberDeleted = true;
        return Promise.resolve({ count: 0 });
      }),
    },
    discipline: {
      deleteMany: jest.fn(() => {
        disciplineDeleted = true;
        return Promise.resolve({ count: 0 });
      }),
    },
    zone: {
      deleteMany: jest.fn(() => {
        zoneDeleted = true;
        return Promise.resolve({ count: 0 });
      }),
    },
    importJob: {
      findMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) =>
        Promise.resolve(importJobs.filter((j) => j.projectId === projectId)),
      ),
      deleteMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) => {
        importJobs = importJobs.filter((j) => j.projectId !== projectId);
        return Promise.resolve({ count: 0 });
      }),
    },
    project: projectDelegate,
  };

  const prisma = {
    project: projectDelegate,
    clash: clashDelegate,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  return {
    prisma,
    projects,
    clashes,
    auditRows,
    wasCleaned: () => ({ projectMemberDeleted, disciplineDeleted, zoneDeleted }),
  };
}

describe('ProjectsService.create', () => {
  it('creates a project with the code trimmed and uppercased', async () => {
    const { prisma, project } = makePrisma();
    const service = new ProjectsService(prisma, makeStorage());

    const created = await service.create({ name: '  Menara Baru  ', code: ' bar ' });

    expect(project.create).toHaveBeenCalledWith({
      data: { name: 'Menara Baru', code: 'BAR' },
    });
    expect(created).toEqual({ id: 'proj-new', name: 'Menara Baru', code: 'BAR', archivedAt: null });
  });

  it('rejects a code that is already taken, case-insensitively via normalization', async () => {
    const { prisma, project } = makePrisma(['BAR']);
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.create({ name: 'Menara Baru', code: 'bar' })).rejects.toThrow(
      ConflictException,
    );
    expect(project.create).not.toHaveBeenCalled();
  });
});

describe('ProjectsService.update — rename cascade', () => {
  it('throws NotFoundException for an unknown project', async () => {
    const { prisma } = makeLifecyclePrisma({ projects: [] });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.update('ghost', { name: 'X' }, ACTOR)).rejects.toThrow(NotFoundException);
  });

  it('a name-only change never touches clash codes', async () => {
    const { prisma, projects, auditRows } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'Old', code: 'OLD', archivedAt: null }],
      clashes: [
        { id: 'c1', projectId: 'p1', disciplineId: 'd1', seq: 1, uniqueCode: 'OLD-ARS-0001', deletedAt: null },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    const result = await service.update('p1', { name: 'New Name' }, ACTOR);

    expect(result).toEqual({
      id: 'p1',
      name: 'New Name',
      code: 'OLD',
      archivedAt: null,
      rewrittenClashCount: 0,
    });
    expect(projects[0].code).toBe('OLD');
    expect(auditRows).toHaveLength(0);
  });

  it('rejects a code already used by another project (409, no rewrite attempted)', async () => {
    const { prisma, auditRows } = makeLifecyclePrisma({
      projects: [
        { id: 'p1', name: 'A', code: 'AAA', archivedAt: null },
        { id: 'p2', name: 'B', code: 'BBB', archivedAt: null },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.update('p1', { code: 'bbb' }, ACTOR)).rejects.toThrow(ConflictException);
    expect(auditRows).toHaveLength(0);
  });

  it('rewrites every clash uniqueCode (including soft-deleted) and writes one code_changed audit row per clash', async () => {
    const { prisma, projects, auditRows } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'OLD', archivedAt: null }],
      disciplines: [{ id: 'd1', projectId: 'p1', code: 'ARS' }],
      clashes: [
        { id: 'c1', projectId: 'p1', disciplineId: 'd1', seq: 1, uniqueCode: 'OLD-ARS-0001', deletedAt: null },
        {
          id: 'c2',
          projectId: 'p1',
          disciplineId: 'd1',
          seq: 2,
          uniqueCode: 'OLD-ARS-0002',
          deletedAt: new Date(),
        },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    const result = await service.update('p1', { code: 'new' }, ACTOR);

    expect(result.rewrittenClashCount).toBe(2);
    expect(projects[0].code).toBe('NEW');
    expect(auditRows).toHaveLength(2);
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clashId: 'c1',
          action: 'code_changed',
          field: 'uniqueCode',
          oldValue: 'OLD-ARS-0001',
          newValue: 'NEW-ARS-0001',
          actorId: ACTOR.id,
        }),
        expect.objectContaining({
          clashId: 'c2',
          action: 'code_changed',
          oldValue: 'OLD-ARS-0002',
          newValue: 'NEW-ARS-0002',
        }),
      ]),
    );
  });

  it('rejects when the new codes would collide with a live clash in a DIFFERENT project (pre-check)', async () => {
    const { prisma, auditRows } = makeLifecyclePrisma({
      projects: [
        { id: 'p1', name: 'A', code: 'OLD', archivedAt: null },
        { id: 'p2', name: 'B', code: 'OTHER', archivedAt: null },
      ],
      disciplines: [{ id: 'd1', projectId: 'p1', code: 'ARS' }],
      clashes: [
        { id: 'c1', projectId: 'p1', disciplineId: 'd1', seq: 1, uniqueCode: 'OLD-ARS-0001', deletedAt: null },
        // Already occupies the code p1's rename would produce.
        { id: 'c2', projectId: 'p2', disciplineId: 'd1', seq: 1, uniqueCode: 'NEW-ARS-0001', deletedAt: null },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.update('p1', { code: 'new' }, ACTOR)).rejects.toThrow(ConflictException);
    expect(auditRows).toHaveLength(0);
  });

  it('converts a P2002 from the raw UPDATE itself into a 409 (concurrent-insert backstop)', async () => {
    const { prisma } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'OLD', archivedAt: null }],
      disciplines: [{ id: 'd1', projectId: 'p1', code: 'ARS' }],
      clashes: [
        { id: 'c1', projectId: 'p1', disciplineId: 'd1', seq: 1, uniqueCode: 'OLD-ARS-0001', deletedAt: null },
      ],
      throwP2002OnExecuteRaw: true,
    });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.update('p1', { code: 'new' }, ACTOR)).rejects.toThrow(ConflictException);
  });
});

describe('ProjectsService.archive / unarchive', () => {
  it('sets archivedAt on archive() and clears it on unarchive()', async () => {
    const { prisma, projects } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'AAA', archivedAt: null }],
    });
    const service = new ProjectsService(prisma, makeStorage());

    const archived = await service.archive('p1');
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(projects[0].archivedAt).toBeInstanceOf(Date);

    const unarchived = await service.unarchive('p1');
    expect(unarchived.archivedAt).toBeNull();
    expect(projects[0].archivedAt).toBeNull();
  });

  it('throws NotFoundException archiving an unknown project', async () => {
    const { prisma } = makeLifecyclePrisma({ projects: [] });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.archive('ghost')).rejects.toThrow(NotFoundException);
  });
});

describe('ProjectsService.stats', () => {
  it('reports total (incl. soft-deleted) and deleted clash counts', async () => {
    const { prisma } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'AAA', archivedAt: null }],
      clashes: [
        { id: 'c1', projectId: 'p1', disciplineId: 'd1', seq: 1, uniqueCode: 'AAA-ARS-0001', deletedAt: null },
        {
          id: 'c2',
          projectId: 'p1',
          disciplineId: 'd1',
          seq: 2,
          uniqueCode: 'AAA-ARS-0002',
          deletedAt: new Date(),
        },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    const stats = await service.stats('p1');

    expect(stats).toEqual({ id: 'p1', totalClashCount: 2, deletedClashCount: 1, archivedAt: null });
  });
});

describe('ProjectsService.remove', () => {
  it('rejects with 409 when the project still has clashes (including soft-deleted)', async () => {
    const { prisma } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'AAA', archivedAt: null }],
      clashes: [
        {
          id: 'c1',
          projectId: 'p1',
          disciplineId: 'd1',
          seq: 1,
          uniqueCode: 'AAA-ARS-0001',
          deletedAt: new Date(),
        },
      ],
    });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.remove('p1')).rejects.toThrow(ConflictException);
  });

  it('hard-deletes an empty project and cleans up members/disciplines/zones/import files', async () => {
    const storage = makeStorage();
    const { prisma, projects, wasCleaned } = makeLifecyclePrisma({
      projects: [{ id: 'p1', name: 'A', code: 'AAA', archivedAt: null }],
      importJobs: [{ id: 'job1', projectId: 'p1', storageKey: 'imports/job1.csv' }],
    });
    const service = new ProjectsService(prisma, storage);

    const result = await service.remove('p1');

    expect(result).toEqual({ id: 'p1' });
    expect(projects).toHaveLength(0);
    expect(wasCleaned()).toEqual({
      projectMemberDeleted: true,
      disciplineDeleted: true,
      zoneDeleted: true,
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(storage.delete).toHaveBeenCalledWith('imports/job1.csv');
  });

  it('throws NotFoundException for an unknown project', async () => {
    const { prisma } = makeLifecyclePrisma({ projects: [] });
    const service = new ProjectsService(prisma, makeStorage());

    await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
  });
});

describe('ProjectsService membership', () => {
  const ALICE: FakeUser = { id: 'u-alice', name: 'Alice', email: 'alice@eps.dev' };
  const BOB: FakeUser = { id: 'u-bob', name: 'Bob', email: 'bob@eps.dev' };

  describe('listMembers', () => {
    it('throws NotFoundException for an unknown project', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [] });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(service.listMembers('proj-ghost')).rejects.toThrow(NotFoundException);
    });

    it('maps membership rows to the shape the frontend consumes, ordered by joinedAt', async () => {
      const older = new Date('2026-01-01');
      const newer = new Date('2026-02-01');
      const { prisma } = makeMembershipPrisma({
        projects: [{ id: 'proj-1' }],
        users: [ALICE, BOB],
        memberships: [
          { projectId: 'proj-1', userId: BOB.id, projectRole: 'Engineer', joinedAt: newer },
          { projectId: 'proj-1', userId: ALICE.id, projectRole: 'Coordinator', joinedAt: older },
        ],
      });
      const service = new ProjectsService(prisma, makeStorage());

      const members = await service.listMembers('proj-1');

      expect(members).toEqual([
        { userId: ALICE.id, name: ALICE.name, email: ALICE.email, projectRole: 'Coordinator', joinedAt: older },
        { userId: BOB.id, name: BOB.name, email: BOB.email, projectRole: 'Engineer', joinedAt: newer },
      ]);
    });
  });

  describe('addMember', () => {
    it('throws NotFoundException for an unknown project', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [] });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(
        service.addMember('proj-ghost', { userId: ALICE.id, projectRole: 'Engineer' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an unknown user', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [{ id: 'proj-1' }], users: [] });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(
        service.addMember('proj-1', { userId: 'u-ghost', projectRole: 'Engineer' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the user is already a member', async () => {
      const { prisma, projectMember } = makeMembershipPrisma({
        projects: [{ id: 'proj-1' }],
        users: [ALICE],
        memberships: [
          { projectId: 'proj-1', userId: ALICE.id, projectRole: 'Engineer', joinedAt: new Date() },
        ],
      });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(
        service.addMember('proj-1', { userId: ALICE.id, projectRole: 'Coordinator' }),
      ).rejects.toThrow(ConflictException);
      expect(projectMember.create).not.toHaveBeenCalled();
    });

    it('adds the member and returns the refreshed member list, not the raw membership row', async () => {
      const { prisma } = makeMembershipPrisma({
        projects: [{ id: 'proj-1' }],
        users: [ALICE],
      });
      const service = new ProjectsService(prisma, makeStorage());

      const result = await service.addMember('proj-1', {
        userId: ALICE.id,
        projectRole: 'Engineer',
      });

      expect(result).toEqual([
        expect.objectContaining({ userId: ALICE.id, name: ALICE.name, projectRole: 'Engineer' }),
      ]);
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException for an unknown project', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [] });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(service.removeMember('proj-ghost', ALICE.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the membership does not exist', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [{ id: 'proj-1' }], users: [ALICE] });
      const service = new ProjectsService(prisma, makeStorage());

      await expect(service.removeMember('proj-1', ALICE.id)).rejects.toThrow(NotFoundException);
    });

    it('deletes the membership using the compound key and returns the refreshed list', async () => {
      const { prisma, projectMember } = makeMembershipPrisma({
        projects: [{ id: 'proj-1' }],
        users: [ALICE, BOB],
        memberships: [
          { projectId: 'proj-1', userId: ALICE.id, projectRole: 'Engineer', joinedAt: new Date() },
          { projectId: 'proj-1', userId: BOB.id, projectRole: 'Coordinator', joinedAt: new Date() },
        ],
      });
      const service = new ProjectsService(prisma, makeStorage());

      const result = await service.removeMember('proj-1', ALICE.id);

      expect(projectMember.delete).toHaveBeenCalledWith({
        where: { projectId_userId: { projectId: 'proj-1', userId: ALICE.id } },
      });
      expect(result).toEqual([expect.objectContaining({ userId: BOB.id })]);
    });
  });
});
