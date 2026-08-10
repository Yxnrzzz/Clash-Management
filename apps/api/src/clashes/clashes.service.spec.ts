import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ClashesService } from './clashes.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/auth.types';
import { DashboardMetricsQueryDto, ListClashesQueryDto } from './dto/clash.dto';

const fakeStorage = {
  saveFromPath: jest.fn(() => Promise.resolve({ key: 'clash-1/fake-key.png' })),
  readStream: jest.fn(),
  signKey: jest.fn((key: string) => ({ token: `signed(${key})`, expiresAt: Date.now() + 300_000 })),
  verifySignedKey: jest.fn((key: string, token: string) => token === `signed(${key})`),
  delete: jest.fn(() => Promise.resolve()),
} as unknown as StorageService;

const fakeNotifications = {
  enqueueAssigned: jest.fn(() => Promise.resolve()),
  enqueueStatusChange: jest.fn(() => Promise.resolve()),
  enqueueOverdue: jest.fn(() => Promise.resolve()),
} as unknown as NotificationsService;

const PROJECT = { id: 'proj-1', code: 'MCA', createdAt: new Date('2026-01-01') };

const STATUSES = [
  { id: 'st-open', name: 'Open', sequence: 1, isClosedState: false },
  { id: 'st-inprogress', name: 'In Progress', sequence: 2, isClosedState: false },
  { id: 'st-resolved', name: 'Resolved', sequence: 3, isClosedState: false },
  { id: 'st-closed', name: 'Closed', sequence: 4, isClosedState: true },
];

const PRIORITIES = [
  { id: 'pr-low', name: 'Low', weight: 1 },
  { id: 'pr-high', name: 'High', weight: 3 },
];

const USERS = [
  { id: 'u-eng', name: 'Dimas Prasetyo', role: Role.ENGINEER, isActive: true },
  { id: 'u-eng2', name: 'Rizky Ananda', role: Role.ENGINEER, isActive: true },
  { id: 'u-eng-inactive', name: 'Bambang Sutrisno', role: Role.ENGINEER, isActive: false },
  { id: 'u-coord', name: 'Siti Rahmawati', role: Role.COORDINATOR, isActive: true },
];

const engineer: AuthUser = { id: 'u-eng', email: 'engineer@clashhub.dev', role: Role.ENGINEER };
const otherEngineer: AuthUser = { id: 'u-eng2', email: 'rizky@clashhub.dev', role: Role.ENGINEER };
const coordinator: AuthUser = { id: 'u-coord', email: 'coordinator@clashhub.dev', role: Role.COORDINATOR };
const admin: AuthUser = { id: 'u-admin', email: 'admin@clashhub.dev', role: Role.ADMIN };

function baseClash(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'clash-1',
    uniqueCode: 'MCA-ARS-0001',
    seq: 1,
    projectId: PROJECT.id,
    title: 'Bentrok pipa',
    description: 'Deskripsi',
    disciplineId: 'disc-ars',
    zoneId: 'zone-1',
    statusId: 'st-open',
    priorityId: 'pr-low',
    reporterId: 'u-eng',
    assigneeId: 'u-eng' as string | null,
    dueDate: null as Date | null,
    createdAt: new Date('2026-07-01'),
    closedAt: null as Date | null,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

const DISCIPLINE_ARS = { id: 'disc-ars', projectId: PROJECT.id, code: 'ARS', name: 'Arsitektur' };

/**
 * A hand-rolled Prisma mock, in the same spirit as auth.service.spec.ts:
 * findUnique/findFirst resolve from the fixed lookup tables above, count and
 * $transaction are stubbed just enough for each test's path.
 *
 * `conflictClash`, if given, is what clash.findFirst returns for restore()'s
 * "is my old code/seq still free" check (a shape distinguishable from
 * assertClashInProject's by-id lookup because it has no `id` key) — leave it
 * undefined for the common "nothing else has claimed it" fast path.
 */
function makePrisma(
  clash: ReturnType<typeof baseClash> | null,
  opts: { conflictClash?: Record<string, unknown> | null } = {},
) {
  const clashRecord = clash;

  const status = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(STATUSES.find((s) => s.id === id) ?? null),
    ),
    findFirst: jest.fn(() => Promise.resolve([...STATUSES].sort((a, b) => a.sequence - b.sequence)[0])),
  };
  const priority = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(PRIORITIES.find((p) => p.id === id) ?? null),
    ),
  };
  const user = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(USERS.find((u) => u.id === id) ?? null),
    ),
  };
  const clashDelegate = {
    findUnique: jest.fn(() => Promise.resolve(clashRecord)),
    // Two different callers share findFirst with different `where` shapes:
    // assertClashInProject looks up by `id` (NOT_DELETED filtering: passes
    // `deletedAt: null` unless includeDeleted is set); restore()'s conflict
    // check has no `id`, just disciplineId/deletedAt/OR.
    findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if ('id' in where) {
        if (!clashRecord) return Promise.resolve(null);
        if ('deletedAt' in where && clashRecord.deletedAt) return Promise.resolve(null);
        return Promise.resolve(clashRecord);
      }
      return Promise.resolve(opts.conflictClash ?? null);
    }),
    findMany: jest.fn(() => Promise.resolve(clashRecord ? [clashRecord] : [])),
    count: jest.fn(() => Promise.resolve(0)),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ ...clashRecord, ...data, id: where.id }),
    ),
    create: jest.fn(),
  };
  const auditLog = {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(() => Promise.resolve([])),
  };
  const project = {
    findFirst: jest.fn(() => Promise.resolve(PROJECT)),
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(id === PROJECT.id ? PROJECT : null),
    ),
    findUniqueOrThrow: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      id === PROJECT.id ? Promise.resolve(PROJECT) : Promise.reject(new Error('not found')),
    ),
  };
  const discipline = {
    findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(id === DISCIPLINE_ARS.id ? DISCIPLINE_ARS : null),
    ),
    findUniqueOrThrow: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      id === DISCIPLINE_ARS.id ? Promise.resolve(DISCIPLINE_ARS) : Promise.reject(new Error('not found')),
    ),
  };
  const comment = {
    findMany: jest.fn(() => Promise.resolve([])),
  };
  const attachment = {
    findMany: jest.fn(() => Promise.resolve([])),
    findUnique: jest.fn(),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'att-1', createdAt: new Date('2026-07-06'), ...data }),
    ),
    delete: jest.fn(),
  };
  const annotation = {
    deleteMany: jest.fn(),
  };
  // Default: "no gap" — allocateLowestFreeSeq's cheap aggregate path (count
  // === max) returns max+1 without a second query. Individual tests override
  // this with mockResolvedValueOnce chains for gap-filling/contested cases.
  const queryRaw = jest.fn<
    Promise<Array<{ count: bigint; max: number } | { seq: number }>>,
    unknown[]
  >(() => Promise.resolve([{ count: BigInt(0), max: 0 }]));
  const executeRaw = jest.fn(() => Promise.resolve(undefined));

  const prisma = {
    project,
    discipline,
    status,
    priority,
    user,
    clash: clashDelegate,
    auditLog,
    comment,
    attachment,
    annotation,
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        clash: clashDelegate,
        auditLog,
        attachment,
        annotation,
        project,
        discipline,
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
      }),
    ),
  } as unknown as PrismaService;

  return { prisma, clashDelegate, auditLog, comment, attachment, annotation, queryRaw, executeRaw };
}

describe('ClashesService.update — RBAC', () => {
  it('rejects an Engineer editing a clash they neither reported nor are assigned to', async () => {
    const { prisma } = makePrisma(baseClash({ assigneeId: null, reporterId: 'u-coord' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { statusId: 'st-inprogress' }, otherEngineer, PROJECT.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an Engineer to edit a clash assigned to them', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ assigneeId: 'u-eng' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { statusId: 'st-inprogress' }, engineer, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });

  it('allows an Engineer to edit a clash they reported, even unassigned', async () => {
    const { prisma, clashDelegate } = makePrisma(
      baseClash({ assigneeId: null, reporterId: 'u-eng' }),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { statusId: 'st-inprogress' }, engineer, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });

  it('lets Coordinator edit any clash regardless of assignment', async () => {
    const { prisma, clashDelegate } = makePrisma(
      baseClash({ assigneeId: 'u-eng', reporterId: 'u-eng' }),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { priorityId: 'pr-high' }, coordinator, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });
});

describe('ClashesService.update — status transitions', () => {
  it('lets an assigned Engineer move one step forward', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { statusId: 'st-inprogress' }, engineer, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });

  it('rejects an Engineer skipping a status two steps forward', async () => {
    const { prisma } = makePrisma(baseClash({ statusId: 'st-open' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { statusId: 'st-resolved' }, engineer, PROJECT.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an Engineer closing a clash even one step forward', async () => {
    const { prisma } = makePrisma(baseClash({ statusId: 'st-resolved' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { statusId: 'st-closed' }, engineer, PROJECT.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects an Engineer reassigning, changing priority, or due date', async () => {
    const { prisma } = makePrisma(baseClash());
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { priorityId: 'pr-high' }, engineer, PROJECT.id),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.update('clash-1', { assigneeId: 'u-eng2' }, engineer, PROJECT.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets Coordinator move to any other status, including closing it', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { statusId: 'st-closed' }, coordinator, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusId: 'st-closed', closedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('ClashesService.update — closedAt and audit log', () => {
  it('clears closedAt when moving out of a closed state', async () => {
    const { prisma, clashDelegate } = makePrisma(
      baseClash({ statusId: 'st-closed', closedAt: new Date('2026-07-05') }),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { statusId: 'st-open' }, coordinator, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statusId: 'st-open', closedAt: null }) }),
    );
  });

  it('writes one audit row per field that actually changed, translated to names', async () => {
    const { prisma, auditLog } = makePrisma(
      baseClash({ statusId: 'st-open', priorityId: 'pr-low', assigneeId: null }),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update(
      'clash-1',
      { statusId: 'st-inprogress', priorityId: 'pr-high', assigneeId: 'u-eng' },
      coordinator,
      PROJECT.id,
    );

    expect(auditLog.createMany).toHaveBeenCalledTimes(1);
    const rows = (auditLog.createMany as jest.Mock).mock.calls[0][0].data as Array<{
      field: string;
      oldValue: string;
      newValue: string;
    }>;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.field === 'statusId')).toMatchObject({
      oldValue: 'Open',
      newValue: 'In Progress',
    });
    expect(rows.find((r) => r.field === 'priorityId')).toMatchObject({
      oldValue: 'Low',
      newValue: 'High',
    });
    expect(rows.find((r) => r.field === 'assigneeId')).toMatchObject({
      oldValue: '-',
      newValue: 'Dimas Prasetyo',
    });
  });

  it('writes no audit row and does not update when the patch value equals the current value', async () => {
    const { prisma, clashDelegate, auditLog } = makePrisma(baseClash({ statusId: 'st-open' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.update('clash-1', { statusId: 'st-open' }, coordinator, PROJECT.id);

    expect(clashDelegate.update).not.toHaveBeenCalled();
    expect(auditLog.createMany).not.toHaveBeenCalled();
    expect(result.statusId).toBe('st-open');
  });
});

describe('ClashesService.update — assignee restricted to active Engineers', () => {
  it('rejects Coordinator assigning to another Coordinator', async () => {
    const { prisma } = makePrisma(baseClash({ assigneeId: null }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { assigneeId: 'u-coord' }, coordinator, PROJECT.id),
    ).rejects.toThrow('Assignee harus Engineer yang aktif.');
  });

  it('rejects assigning to a user id that does not exist', async () => {
    const { prisma } = makePrisma(baseClash({ assigneeId: null }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { assigneeId: 'no-such-user' }, coordinator, PROJECT.id),
    ).rejects.toThrow('Assignee harus Engineer yang aktif.');
  });

  it('rejects assigning to an inactive Engineer', async () => {
    const { prisma } = makePrisma(baseClash({ assigneeId: null }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { assigneeId: 'u-eng-inactive' }, coordinator, PROJECT.id),
    ).rejects.toThrow('Assignee harus Engineer yang aktif.');
  });

  it('allows assigning to an active Engineer', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ assigneeId: null }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { assigneeId: 'u-eng2' }, coordinator, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });

  it('allows clearing the assignee with null', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ assigneeId: 'u-eng' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.update('clash-1', { assigneeId: null }, coordinator, PROJECT.id);
    expect(clashDelegate.update).toHaveBeenCalled();
  });
});

describe('ClashesService.bulkUpdate', () => {
  it('counts only the clashes whose patch actually changed something', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open' }));
    (clashDelegate.findMany as jest.Mock) = jest.fn(() =>
      Promise.resolve([
        baseClash({ id: 'clash-1', statusId: 'st-open' }),
        baseClash({ id: 'clash-2', statusId: 'st-inprogress' }),
      ]),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.bulkUpdate(
      { ids: ['clash-1', 'clash-2'], patch: { statusId: 'st-inprogress' } },
      coordinator,
      PROJECT.id,
    );

    // clash-2 is already at st-inprogress, so its patch is a no-op.
    expect(result).toEqual({ updated: 1 });
    expect(clashDelegate.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['clash-1', 'clash-2'] }, projectId: PROJECT.id, deletedAt: null },
    });
  });

  it('rejects the whole batch (404) if any id does not belong to the active project', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open' }));
    (clashDelegate.findMany as jest.Mock) = jest.fn(() =>
      Promise.resolve([baseClash({ id: 'clash-1', statusId: 'st-open' })]),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.bulkUpdate(
        { ids: ['clash-1', 'clash-in-other-project'], patch: { statusId: 'st-inprogress' } },
        coordinator,
        PROJECT.id,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects the whole batch when the patch assigns to a non-Engineer, without updating any row', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open' }));
    (clashDelegate.findMany as jest.Mock) = jest.fn(() =>
      Promise.resolve([
        baseClash({ id: 'clash-1', statusId: 'st-open' }),
        baseClash({ id: 'clash-2', statusId: 'st-open' }),
      ]),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.bulkUpdate(
        { ids: ['clash-1', 'clash-2'], patch: { assigneeId: 'u-coord' } },
        coordinator,
        PROJECT.id,
      ),
    ).rejects.toThrow('Assignee harus Engineer yang aktif.');
    expect(clashDelegate.update).not.toHaveBeenCalled();
  });

  it('allows a batch that assigns to an active Engineer', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash({ statusId: 'st-open', assigneeId: null }));
    (clashDelegate.findMany as jest.Mock) = jest.fn(() =>
      Promise.resolve([baseClash({ id: 'clash-1', statusId: 'st-open', assigneeId: null })]),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.bulkUpdate(
      { ids: ['clash-1'], patch: { assigneeId: 'u-eng2' } },
      coordinator,
      PROJECT.id,
    );

    expect(result).toEqual({ updated: 1 });
  });
});

describe('ClashesService.create', () => {
  function withZone(prisma: PrismaService) {
    const zone = { id: 'zone-1', projectId: PROJECT.id, name: 'Zona A', level: 'Lantai 1' };
    (prisma as unknown as { zone: unknown }).zone = {
      findUnique: jest.fn(() => Promise.resolve(zone)),
    };
  }

  it('builds a uniqueCode as PROJECT-DISCIPLINE-NNNN (no gap) and writes a "created" audit row', async () => {
    const { prisma, clashDelegate, auditLog, queryRaw } = makePrisma(null);
    withZone(prisma);
    // No gap: 4 live rows, max seq 4 — allocateLowestFreeSeq's cheap path
    // returns max+1 without a second (generate_series) query.
    queryRaw.mockResolvedValue([{ count: BigInt(4), max: 4 }]);
    (clashDelegate.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'clash-new', ...data }),
    );

    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);
    const created = (await service.create(
      {
        title: 'Judul',
        description: 'Deskripsi',
        disciplineId: 'disc-ars',
        zoneId: 'zone-1',
        priorityId: 'pr-low',
      },
      engineer,
      PROJECT.id,
    )) as { uniqueCode: string; seq: number; reporterId: string };

    expect(created.uniqueCode).toBe('MCA-ARS-0005');
    expect(created.seq).toBe(5);
    expect(created.reporterId).toBe('u-eng');
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clashId: 'clash-new', action: 'created', actorId: 'u-eng' }),
      }),
    );
  });

  it('allocates the lowest free sequence, filling a gap left by a soft-deleted clash', async () => {
    // Regression guard for the inverse of the old invariant: a soft-deleted
    // clash's seq/uniqueCode is now reusable — 3 live rows but max seq is 3
    // means one of 1..3 is free (a prior clash there was deleted), and the
    // allocator must pick that gap (2) rather than appending at 4.
    const { prisma, clashDelegate, queryRaw, executeRaw } = makePrisma(null);
    withZone(prisma);
    queryRaw
      .mockResolvedValueOnce([{ count: BigInt(2), max: 3 }])
      .mockResolvedValueOnce([{ seq: 2 }]);
    (clashDelegate.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'clash-new', ...data }),
    );

    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);
    const created = (await service.create(
      {
        title: 'Judul',
        description: 'Deskripsi',
        disciplineId: 'disc-ars',
        zoneId: 'zone-1',
        priorityId: 'pr-low',
      },
      engineer,
      PROJECT.id,
    )) as { uniqueCode: string; seq: number };

    expect(created.uniqueCode).toBe('MCA-ARS-0002');
    expect(created.seq).toBe(2);
    // The advisory lock must be taken before allocating, to serialize
    // concurrent creates in the same discipline — see clash-code.ts.
    expect(executeRaw).toHaveBeenCalled();
  });

  it('retries once on a code/seq race (P2002) and succeeds on the second attempt', async () => {
    const { prisma, clashDelegate, queryRaw } = makePrisma(null);
    withZone(prisma);
    queryRaw.mockResolvedValue([{ count: BigInt(0), max: 0 }]);
    (clashDelegate.create as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Prisma.PrismaClientKnownRequestError('unique violation', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['uniqueCode'] },
        });
      })
      .mockImplementationOnce(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'clash-new', ...data }),
      );

    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);
    const created = (await service.create(
      {
        title: 'Judul',
        description: 'Deskripsi',
        disciplineId: 'disc-ars',
        zoneId: 'zone-1',
        priorityId: 'pr-low',
      },
      engineer,
      PROJECT.id,
    )) as { uniqueCode: string };

    expect(created.uniqueCode).toBe('MCA-ARS-0001');
    expect(clashDelegate.create).toHaveBeenCalledTimes(2);
  });
});

describe('ClashesService.list', () => {
  it('translates filter/sort/pagination query params into Prisma where/orderBy/skip/take', async () => {
    const rows = [baseClash({ id: 'c1' })];
    const findMany = jest.fn(() => Promise.resolve(rows));
    const count = jest.fn(() => Promise.resolve(1));
    const prisma = {
      clash: { findMany, count },
    } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.list(
      {
        disc: ['disc-ars'],
        stat: ['st-open'],
        prio: [],
        zone: [],
        assignee: [],
        overdue: true,
        q: 'pipa',
        sort: 'status',
        dir: 'asc',
        page: 2,
        pageSize: 20,
      } as ListClashesQueryDto,
      PROJECT.id,
      engineer,
    );

    expect(result).toEqual({ data: rows, total: 1 });
    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        projectId: PROJECT.id,
        deletedAt: null,
        disciplineId: { in: ['disc-ars'] },
        statusId: { in: ['st-open'] },
        status: { isClosedState: false },
        dueDate: { lt: expect.any(Date) },
        OR: expect.any(Array),
      }),
      orderBy: { status: { sequence: 'asc' } },
      skip: 20,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ projectId: PROJECT.id, deletedAt: null }),
    });
  });

  it('defaults to createdAt desc, page 1, with no filters applied', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const count = jest.fn(() => Promise.resolve(0));
    const prisma = {
      clash: { findMany, count },
    } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.list(
      { sort: 'createdAt', dir: 'desc', page: 1, pageSize: 10 } as ListClashesQueryDto,
      PROJECT.id,
      engineer,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('switches to the trash-bin view for Admin when deleted=true', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const count = jest.fn(() => Promise.resolve(0));
    const prisma = {
      clash: { findMany, count },
    } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.list(
      { sort: 'createdAt', dir: 'desc', page: 1, pageSize: 10, deleted: true } as ListClashesQueryDto,
      PROJECT.id,
      admin,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT.id, deletedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 10,
    });
  });

  it('rejects a non-Admin requesting the trash-bin view', async () => {
    const prisma = { clash: { findMany: jest.fn(), count: jest.fn() } } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.list(
        { sort: 'createdAt', dir: 'desc', page: 1, pageSize: 10, deleted: true } as ListClashesQueryDto,
        PROJECT.id,
        coordinator,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('ClashesService.export', () => {
  it('applies the same filters as list() but ignores page/pageSize, capping take at EXPORT_MAX_ROWS', async () => {
    const rows = [baseClash({ id: 'c1' })];
    const findMany = jest.fn(() => Promise.resolve(rows));
    const count = jest.fn(() => Promise.resolve(1));
    const prisma = { clash: { findMany, count } } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.export(
      { disc: ['disc-ars'], sort: 'status', dir: 'asc', page: 3, pageSize: 500 } as ListClashesQueryDto,
      PROJECT.id,
      engineer,
    );

    expect(result).toEqual({ data: rows, total: 1 });
    // Exact-match (not objectContaining) on the whole call — proves there's
    // no `skip` key at all, so every call gets page 1 regardless of what
    // `page` the caller supplied, since export never paginates.
    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ projectId: PROJECT.id, disciplineId: { in: ['disc-ars'] } }),
      orderBy: { status: { sequence: 'asc' } },
      take: 5000,
    });
  });

  it('reports the true match count even when it exceeds what was returned', async () => {
    const rows = [baseClash({ id: 'c1' })];
    const findMany = jest.fn(() => Promise.resolve(rows));
    const count = jest.fn(() => Promise.resolve(7_000));
    const prisma = { clash: { findMany, count } } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.export(
      { sort: 'createdAt', dir: 'desc', page: 1, pageSize: 10 } as ListClashesQueryDto,
      PROJECT.id,
      engineer,
    );

    expect(result.total).toBe(7_000);
    expect(result.data).toHaveLength(1);
  });

  it('rejects a non-Admin requesting the trash-bin view, same as list()', async () => {
    const prisma = { clash: { findMany: jest.fn(), count: jest.fn() } } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.export(
        { sort: 'createdAt', dir: 'desc', page: 1, pageSize: 10, deleted: true } as ListClashesQueryDto,
        PROJECT.id,
        coordinator,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('ClashesService.metrics', () => {
  it('aggregates totals, MTTR, overdue count, weekly trend, and zero-filled slices', async () => {
    const clashes = [
      {
        disciplineId: 'disc-ars',
        zoneId: 'zone-1',
        priorityId: 'pr-low',
        statusId: 'st-open',
        dueDate: new Date('2026-06-01'),
        createdAt: new Date('2026-06-29'),
        closedAt: null,
      },
      {
        disciplineId: 'disc-ars',
        zoneId: 'zone-1',
        priorityId: 'pr-high',
        statusId: 'st-closed',
        dueDate: null,
        createdAt: new Date('2026-06-30'),
        closedAt: new Date('2026-07-02'),
      },
    ];
    const prisma = {
      discipline: { findMany: jest.fn(() => Promise.resolve([{ id: 'disc-ars', code: 'ARS' }])) },
      zone: {
        findMany: jest.fn(() => Promise.resolve([{ id: 'zone-1', name: 'Zona A', level: 'Lantai 1' }])),
      },
      priority: { findMany: jest.fn(() => Promise.resolve(PRIORITIES)) },
      status: { findMany: jest.fn(() => Promise.resolve(STATUSES)) },
      clash: { findMany: jest.fn(() => Promise.resolve(clashes)) },
    } as unknown as PrismaService;
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.metrics({ to: '2026-07-05' } as DashboardMetricsQueryDto, PROJECT.id);

    expect(result.totalClash).toBe(2);
    expect(result.closedCount).toBe(1);
    expect(result.openCount).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(result.mttrDays).toBe(2);
    expect(result.byDiscipline).toEqual([{ id: 'disc-ars', label: 'ARS', value: 2 }]);
    expect(result.byPriority).toEqual([
      { id: 'pr-low', label: 'Low', value: 1 },
      { id: 'pr-high', label: 'High', value: 1 },
    ]);
    expect(result.byZone).toEqual([{ id: 'zone-1', label: 'Lantai 1 · Zona A', value: 2 }]);
    expect(result.trend.reduce((sum, t) => sum + t.createdCount, 0)).toBe(2);
    expect(result.trend.reduce((sum, t) => sum + t.closedCount, 0)).toBe(1);
  });
});

describe('ClashesService.findDetail', () => {
  it('includes comments, audit logs, and attachments for the clash', async () => {
    const { prisma, comment, attachment } = makePrisma(baseClash());
    (comment.findMany as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    (attachment.findMany as jest.Mock).mockResolvedValue([{ id: 'att-1' }]);
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const detail = await service.findDetail('clash-1', PROJECT.id);

    expect(detail.comments).toEqual([{ id: 'c1' }]);
    expect(detail.attachments).toEqual([{ id: 'att-1' }]);
  });

  it('throws NotFoundException for a missing clash', async () => {
    const { prisma } = makePrisma(null);
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.findDetail('missing', PROJECT.id)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the clash belongs to a different project', async () => {
    const { prisma } = makePrisma(baseClash({ projectId: 'proj-other' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.findDetail('clash-1', PROJECT.id)).rejects.toThrow(NotFoundException);
  });
});

describe('ClashesService.addAttachments', () => {
  it('saves each file to storage and creates a matching Attachment row', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);
    const files = [
      { originalname: 'photo.png', mimetype: 'image/png', size: 1024, path: '/tmp/upload-abc123' },
    ] as Express.Multer.File[];

    const created = await service.addAttachments('clash-1', files, engineer, PROJECT.id);

    expect(fakeStorage.saveFromPath).toHaveBeenCalledWith(files[0].path, 'clash-1', 'photo.png');
    expect(attachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clashId: 'clash-1',
        fileName: 'photo.png',
        fileUrl: 'clash-1/fake-key.png',
        fileType: 'image/png',
        sizeBytes: 1024,
        uploadedById: 'u-eng',
      }),
    });
    expect(created).toHaveLength(1);
  });

  it('writes an "attachment_added" audit row per uploaded file', async () => {
    const { prisma, auditLog } = makePrisma(baseClash());
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);
    const files = [
      { originalname: 'photo.png', mimetype: 'image/png', size: 1024, buffer: Buffer.from('x') },
    ] as Express.Multer.File[];

    await service.addAttachments('clash-1', files, engineer, PROJECT.id);

    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        clashId: 'clash-1',
        actorId: 'u-eng',
        action: 'attachment_added',
        field: 'attachment',
        newValue: 'photo.png',
      },
    });
  });

  it('throws NotFoundException for a missing clash', async () => {
    const { prisma } = makePrisma(null);
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.addAttachments('missing', [], engineer, PROJECT.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the clash belongs to a different project', async () => {
    const { prisma } = makePrisma(baseClash({ projectId: 'proj-other' }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.addAttachments('clash-1', [], engineer, PROJECT.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ClashesService.deleteAttachment', () => {
  function withAttachment(uploadedById: string) {
    const { prisma, attachment, auditLog } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
      fileName: 'photo.png',
      uploadedById,
    });
    return { prisma, attachment, auditLog };
  }

  it('allows an Engineer to delete their own upload', async () => {
    const { prisma, attachment, auditLog } = withAttachment('u-eng');
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.deleteAttachment('clash-1', 'att-1', engineer, PROJECT.id);

    expect(result).toEqual({ id: 'att-1' });
    expect(attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    expect(prisma.annotation.deleteMany).toHaveBeenCalledWith({ where: { attachmentId: 'att-1' } });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        clashId: 'clash-1',
        actorId: 'u-eng',
        action: 'attachment_deleted',
        field: 'attachment',
        oldValue: 'photo.png',
      },
    });
    expect(fakeStorage.delete).toHaveBeenCalledWith('clash-1/fake-key.png');
  });

  it('rejects an Engineer deleting someone else\'s upload', async () => {
    const { prisma, attachment } = withAttachment('u-eng2');
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.deleteAttachment('clash-1', 'att-1', engineer, PROJECT.id)).rejects.toThrow(
      ForbiddenException,
    );
    expect(attachment.delete).not.toHaveBeenCalled();
  });

  it('allows Coordinator to delete any upload', async () => {
    const { prisma, attachment } = withAttachment('u-eng');
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.deleteAttachment('clash-1', 'att-1', coordinator, PROJECT.id);
    expect(attachment.delete).toHaveBeenCalled();
  });

  it('allows Admin to delete any upload', async () => {
    const { prisma, attachment } = withAttachment('u-eng');
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.deleteAttachment('clash-1', 'att-1', admin, PROJECT.id);
    expect(attachment.delete).toHaveBeenCalled();
  });

  it('throws NotFoundException for an attachment from another clash', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-other',
      fileUrl: 'x',
      fileName: 'photo.png',
      uploadedById: 'u-eng',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.deleteAttachment('clash-1', 'att-1', engineer, PROJECT.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('does not throw when the storage unlink fails (fire-and-forget)', async () => {
    const { prisma } = withAttachment('u-eng');
    const failingStorage = {
      ...fakeStorage,
      delete: jest.fn(() => Promise.reject(new Error('disk unavailable'))),
    } as unknown as StorageService;
    const service = new ClashesService(prisma, failingStorage, fakeNotifications);

    await expect(service.deleteAttachment('clash-1', 'att-1', engineer, PROJECT.id)).resolves.toEqual({
      id: 'att-1',
    });
  });
});

describe('ClashesService.getAttachmentForDownload', () => {
  it('returns the stream for an attachment that belongs to the clash', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.getAttachmentForDownload('clash-1', 'att-1', engineer, PROJECT.id);

    expect(result.attachment.id).toBe('att-1');
    expect(fakeStorage.readStream).toHaveBeenCalledWith('clash-1/fake-key.png');
  });

  it('throws NotFoundException when the attachment belongs to a different clash', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-other',
      fileUrl: 'x',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.getAttachmentForDownload('clash-1', 'att-1', engineer, PROJECT.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the clash itself belongs to a different project', async () => {
    const { prisma, attachment } = makePrisma(baseClash({ projectId: 'proj-other' }));
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.getAttachmentForDownload('clash-1', 'att-1', engineer, PROJECT.id),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClashesService.getAttachmentSignedUrl', () => {
  it('signs attachmentId, not the raw storage key or filesystem path', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.getAttachmentSignedUrl('clash-1', 'att-1', engineer, PROJECT.id);

    expect(fakeStorage.signKey).toHaveBeenCalledWith('attachment:att-1');
    expect(result.url).toContain('/clashes/attachments/att-1/signed?token=');
    expect(result.url).not.toContain('fake-key.png');
  });

  it('throws NotFoundException for an attachment from another clash, same as getAttachmentForDownload', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-other',
      fileUrl: 'x',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.getAttachmentSignedUrl('clash-1', 'att-1', engineer, PROJECT.id),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClashesService.streamBySignedToken', () => {
  it('streams the attachment when the token verifies', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const result = await service.streamBySignedToken('att-1', 'signed(attachment:att-1)', Date.now() + 1000);

    expect(fakeStorage.verifySignedKey).toHaveBeenCalledWith(
      'attachment:att-1',
      'signed(attachment:att-1)',
      expect.any(Number),
    );
    expect(result.attachment.id).toBe('att-1');
    expect(fakeStorage.readStream).toHaveBeenCalledWith('clash-1/fake-key.png');
  });

  it('throws ForbiddenException for a token that fails verification (expired, forged, or wrong attachment)', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue({
      id: 'att-1',
      clashId: 'clash-1',
      fileUrl: 'clash-1/fake-key.png',
    });
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.streamBySignedToken('att-1', 'not-the-right-token', Date.now() + 1000),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when no attachment matches the id at all', async () => {
    const { prisma, attachment } = makePrisma(baseClash());
    (attachment.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.streamBySignedToken('att-ghost', 'anything', Date.now() + 1000),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClashesService.softDelete', () => {
  it('sets deletedAt and writes a "deleted" audit row', async () => {
    const { prisma, clashDelegate, auditLog } = makePrisma(baseClash());
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.softDelete('clash-1', admin, PROJECT.id);

    expect(clashDelegate.update).toHaveBeenCalledWith({
      where: { id: 'clash-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: { clashId: 'clash-1', actorId: 'u-admin', action: 'deleted' },
    });
  });

  it('throws NotFoundException when deleting an already-deleted clash', async () => {
    const { prisma } = makePrisma(baseClash({ deletedAt: new Date('2026-07-10') }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.softDelete('clash-1', admin, PROJECT.id)).rejects.toThrow(NotFoundException);
  });
});

describe('ClashesService.restore', () => {
  it('clears deletedAt and writes a "restored" audit row', async () => {
    const { prisma, clashDelegate, auditLog } = makePrisma(
      baseClash({ deletedAt: new Date('2026-07-10') }),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await service.restore('clash-1', admin, PROJECT.id);

    expect(clashDelegate.update).toHaveBeenCalledWith({
      where: { id: 'clash-1' },
      data: { deletedAt: null },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: { clashId: 'clash-1', actorId: 'u-admin', action: 'restored' },
    });
  });

  it('allocates a fresh seq at the end and records code_reassigned when the old code/seq was taken', async () => {
    // Another live clash now occupies disc-ars/seq 1 (MCA-ARS-0001) — the
    // clash being restored can't have its old code back.
    const { prisma, clashDelegate, auditLog, queryRaw } = makePrisma(
      baseClash({ deletedAt: new Date('2026-07-10'), uniqueCode: 'MCA-ARS-0001', seq: 1 }),
      { conflictClash: { id: 'clash-other' } },
    );
    queryRaw.mockResolvedValueOnce([{ seq: 9 }]); // allocateNextSeq
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    const updated = (await service.restore('clash-1', admin, PROJECT.id)) as {
      seq: number;
      uniqueCode: string;
    };

    expect(updated.seq).toBe(9);
    expect(updated.uniqueCode).toBe('MCA-ARS-0009');
    expect(clashDelegate.update).toHaveBeenCalledWith({
      where: { id: 'clash-1' },
      data: { deletedAt: null, seq: 9, uniqueCode: 'MCA-ARS-0009' },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: { clashId: 'clash-1', actorId: 'u-admin', action: 'restored' },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        clashId: 'clash-1',
        actorId: 'u-admin',
        action: 'code_reassigned',
        field: 'uniqueCode',
        oldValue: 'MCA-ARS-0001',
        newValue: 'MCA-ARS-0009',
      },
    });
  });

  it('rejects restoring a clash that is not deleted', async () => {
    const { prisma } = makePrisma(baseClash({ deletedAt: null }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.restore('clash-1', admin, PROJECT.id)).rejects.toThrow(
      'Clash ini tidak dalam status terhapus.',
    );
  });

  it('throws NotFoundException restoring an id that does not exist at all', async () => {
    const { prisma } = makePrisma(null);
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.restore('missing', admin, PROJECT.id)).rejects.toThrow(NotFoundException);
  });
});

describe('soft-deleted clashes are invisible to the normal read/write paths', () => {
  it('findDetail 404s for a soft-deleted clash', async () => {
    const { prisma } = makePrisma(baseClash({ deletedAt: new Date('2026-07-10') }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(service.findDetail('clash-1', PROJECT.id)).rejects.toThrow(NotFoundException);
  });

  it('update 404s for a soft-deleted clash', async () => {
    const { prisma } = makePrisma(baseClash({ deletedAt: new Date('2026-07-10') }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.update('clash-1', { statusId: 'st-inprogress' }, coordinator, PROJECT.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('addComment 404s for a soft-deleted clash', async () => {
    const { prisma } = makePrisma(baseClash({ deletedAt: new Date('2026-07-10') }));
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.addComment('clash-1', { content: 'hi' }, coordinator, PROJECT.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('bulkUpdate rejects the whole batch if any id is soft-deleted', async () => {
    const { prisma, clashDelegate } = makePrisma(baseClash());
    // findMany is what bulkUpdate actually queries; simulate the deleted
    // row being filtered out by NOT_DELETED so the length check trips.
    (clashDelegate.findMany as jest.Mock) = jest.fn(() =>
      Promise.resolve([baseClash({ id: 'clash-1' })]),
    );
    const service = new ClashesService(prisma, fakeStorage, fakeNotifications);

    await expect(
      service.bulkUpdate(
        { ids: ['clash-1', 'clash-2-deleted'], patch: { statusId: 'st-inprogress' } },
        coordinator,
        PROJECT.id,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
