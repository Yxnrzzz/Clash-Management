import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MasterDataService } from './master-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

const FROM_PROJECT = { id: 'proj-1', code: 'MCA', archivedAt: null as Date | null };
const TO_PROJECT = { id: 'proj-2', code: 'MCB', archivedAt: null as Date | null };
const ARCHIVED_PROJECT = { id: 'proj-3', code: 'MCC', archivedAt: new Date('2026-08-01') };

const ACTOR: AuthUser = { id: 'u-admin', email: 'admin@eps.dev', role: 'ADMIN' } as AuthUser;

function makeHarness(opts: {
  sourceDisciplines?: { id: string; code: string; name: string; isActive: boolean }[];
  targetDisciplines?: { id: string; code: string; name: string }[];
  sourceZones?: { id: string; name: string; level: string; isActive: boolean }[];
  targetZones?: { id: string; name: string; level: string }[];
}) {
  const sourceDisciplines = opts.sourceDisciplines ?? [];
  const targetDisciplines = [...(opts.targetDisciplines ?? [])];
  const sourceZones = opts.sourceZones ?? [];
  const targetZones = [...(opts.targetZones ?? [])];

  const disciplineCreate = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `disc-new-${targetDisciplines.length + 1}`, ...data } as {
      id: string;
      code: string;
      name: string;
    };
    targetDisciplines.push(row);
    return Promise.resolve(row);
  });
  const zoneCreate = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `zone-new-${targetZones.length + 1}`, ...data } as {
      id: string;
      name: string;
      level: string;
    };
    targetZones.push(row);
    return Promise.resolve(row);
  });

  const prisma = {
    project: {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve([FROM_PROJECT, TO_PROJECT, ARCHIVED_PROJECT].find((p) => p.id === id) ?? null),
      ),
    },
    discipline: {
      findMany: jest.fn(({ where }: { where: { projectId: string; isActive?: boolean } }) =>
        Promise.resolve(
          where.projectId === FROM_PROJECT.id
            ? sourceDisciplines.filter((d) => !where.isActive || d.isActive)
            : targetDisciplines,
        ),
      ),
      create: disciplineCreate,
    },
    zone: {
      findMany: jest.fn(({ where }: { where: { projectId: string; isActive?: boolean } }) =>
        Promise.resolve(
          where.projectId === FROM_PROJECT.id
            ? sourceZones.filter((z) => !where.isActive || z.isActive)
            : targetZones,
        ),
      ),
      create: zoneCreate,
    },
  } as unknown as PrismaService;

  const service = new MasterDataService(prisma);
  return { service, disciplineCreate, zoneCreate, targetDisciplines, targetZones };
}

describe('MasterDataService.copyTemplate', () => {
  it('copies active disciplines and zones the target project does not already have', async () => {
    const { service, disciplineCreate, zoneCreate } = makeHarness({
      sourceDisciplines: [
        { id: 'd1', code: 'ARS', name: 'Arsitektur', isActive: true },
        { id: 'd2', code: 'MEP', name: 'Mekanikal', isActive: true },
        { id: 'd3', code: 'OLD', name: 'Nonaktif', isActive: false },
      ],
      sourceZones: [{ id: 'z1', name: 'Zona A', level: 'Lantai 1', isActive: true }],
    });

    const result = await service.copyTemplate({
      fromProjectId: FROM_PROJECT.id,
      toProjectId: TO_PROJECT.id,
      include: ['disciplines', 'zones'],
    });

    expect(disciplineCreate).toHaveBeenCalledTimes(2);
    expect(disciplineCreate).toHaveBeenCalledWith({
      data: { projectId: TO_PROJECT.id, code: 'ARS', name: 'Arsitektur' },
    });
    expect(zoneCreate).toHaveBeenCalledWith({
      data: { projectId: TO_PROJECT.id, name: 'Zona A', level: 'Lantai 1' },
    });
    expect(result).toEqual({ copied: { disciplines: 2, zones: 1 }, skipped: { disciplines: 0, zones: 0 } });
  });

  it('skips rows that already exist in the target (idempotent on a second run)', async () => {
    const { service, disciplineCreate } = makeHarness({
      sourceDisciplines: [{ id: 'd1', code: 'ars', name: 'Arsitektur', isActive: true }],
      targetDisciplines: [{ id: 'existing', code: 'ARS', name: 'Arsitektur' }],
    });

    const result = await service.copyTemplate({
      fromProjectId: FROM_PROJECT.id,
      toProjectId: TO_PROJECT.id,
      include: ['disciplines'],
    });

    expect(disciplineCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ copied: { disciplines: 0, zones: 0 }, skipped: { disciplines: 1, zones: 0 } });
  });

  it('running the same copy twice in a row copies nothing the second time', async () => {
    const { service, disciplineCreate } = makeHarness({
      sourceDisciplines: [{ id: 'd1', code: 'ARS', name: 'Arsitektur', isActive: true }],
    });

    const first = await service.copyTemplate({
      fromProjectId: FROM_PROJECT.id,
      toProjectId: TO_PROJECT.id,
      include: ['disciplines'],
    });
    expect(first.copied.disciplines).toBe(1);
    expect(disciplineCreate).toHaveBeenCalledTimes(1);

    const second = await service.copyTemplate({
      fromProjectId: FROM_PROJECT.id,
      toProjectId: TO_PROJECT.id,
      include: ['disciplines'],
    });
    expect(second).toEqual({ copied: { disciplines: 0, zones: 0 }, skipped: { disciplines: 1, zones: 0 } });
    expect(disciplineCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects copying a project into itself', async () => {
    const { service } = makeHarness({});

    await expect(
      service.copyTemplate({ fromProjectId: FROM_PROJECT.id, toProjectId: FROM_PROJECT.id, include: ['zones'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when either project does not exist', async () => {
    const { service } = makeHarness({});

    await expect(
      service.copyTemplate({ fromProjectId: 'missing', toProjectId: TO_PROJECT.id, include: ['zones'] }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects copying into an archived target project', async () => {
    const { service } = makeHarness({});

    await expect(
      service.copyTemplate({
        fromProjectId: FROM_PROJECT.id,
        toProjectId: ARCHIVED_PROJECT.id,
        include: ['zones'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

// --- updateDiscipline rename cascade ----------------------------------------

interface FakeDisciplineRow {
  id: string;
  projectId: string;
  code: string;
  name: string;
}
interface FakeClashRow {
  id: string;
  projectId: string;
  disciplineId: string;
  seq: number;
  uniqueCode: string;
  deletedAt: Date | null;
}

function makeDisciplineRenameHarness(opts: {
  project?: { id: string; code: string };
  disciplines?: FakeDisciplineRow[];
  clashes?: FakeClashRow[];
  throwP2002OnExecuteRaw?: boolean;
}) {
  const project = opts.project ?? { id: 'proj-1', code: 'MCA' };
  const disciplines = opts.disciplines ?? [];
  const clashes = opts.clashes ?? [];
  const auditRows: {
    clashId: string;
    actorId: string;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
  }[] = [];

  function clashMatches(c: FakeClashRow, where: Record<string, unknown>): boolean {
    if ('disciplineId' in where) {
      const did = where.disciplineId as string | { not: string };
      if (typeof did === 'object' && did !== null) {
        if (c.disciplineId === did.not) return false;
      } else if (c.disciplineId !== did) {
        return false;
      }
    }
    if ('deletedAt' in where && where.deletedAt === null && c.deletedAt !== null) return false;
    if ('uniqueCode' in where) {
      const uc = where.uniqueCode as { in: string[] };
      if (!uc.in.includes(c.uniqueCode)) return false;
    }
    return true;
  }

  const disciplineDelegate = {
    findUnique: jest.fn(
      ({ where }: { where: { id?: string; projectId_code?: { projectId: string; code: string } } }) => {
        if (where.id !== undefined) return Promise.resolve(disciplines.find((d) => d.id === where.id) ?? null);
        const key = where.projectId_code!;
        return Promise.resolve(
          disciplines.find((d) => d.projectId === key.projectId && d.code === key.code) ?? null,
        );
      },
    ),
    update: jest.fn(({ where: { id }, data }: { where: { id: string }; data: Partial<FakeDisciplineRow> }) => {
      const row = disciplines.find((d) => d.id === id)!;
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
  };

  const clashDelegate = {
    findMany: jest.fn(({ where, take }: { where: Record<string, unknown>; take?: number }) => {
      let rows = clashes.filter((c) => clashMatches(c, where));
      if (take) rows = rows.slice(0, take);
      return Promise.resolve(rows);
    }),
  };

  const tx = {
    project: { findUniqueOrThrow: jest.fn(() => Promise.resolve(project)) },
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
  };

  const prisma = {
    discipline: disciplineDelegate,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const service = new MasterDataService(prisma);
  return { service, disciplines, auditRows };
}

describe('MasterDataService.updateDiscipline — rename cascade', () => {
  it('throws NotFoundException for an unknown discipline', async () => {
    const { service } = makeDisciplineRenameHarness({ disciplines: [] });

    await expect(service.updateDiscipline('ghost', { name: 'X' }, 'proj-1', ACTOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the discipline belongs to a different project', async () => {
    const { service } = makeDisciplineRenameHarness({
      disciplines: [{ id: 'd1', projectId: 'proj-other', code: 'ARS', name: 'Arsitektur' }],
    });

    await expect(service.updateDiscipline('d1', { name: 'X' }, 'proj-1', ACTOR)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('a name-only change never touches clash codes', async () => {
    const { service, disciplines, auditRows } = makeDisciplineRenameHarness({
      disciplines: [{ id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'Old' }],
      clashes: [
        { id: 'c1', projectId: 'proj-1', disciplineId: 'd1', seq: 1, uniqueCode: 'MCA-ARS-0001', deletedAt: null },
      ],
    });

    const result = await service.updateDiscipline('d1', { name: 'New' }, 'proj-1', ACTOR);

    expect(result).toEqual({ id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'New' });
    expect(disciplines[0].code).toBe('ARS');
    expect(auditRows).toHaveLength(0);
  });

  it('rejects a code already used by another discipline in the same project', async () => {
    const { service, auditRows } = makeDisciplineRenameHarness({
      disciplines: [
        { id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'Arsitektur' },
        { id: 'd2', projectId: 'proj-1', code: 'MEP', name: 'Mekanikal' },
      ],
    });

    await expect(service.updateDiscipline('d1', { code: 'mep' }, 'proj-1', ACTOR)).rejects.toThrow(
      ConflictException,
    );
    expect(auditRows).toHaveLength(0);
  });

  it('rewrites every clash uniqueCode (including soft-deleted) and writes one code_changed audit row per clash', async () => {
    const { service, disciplines, auditRows } = makeDisciplineRenameHarness({
      project: { id: 'proj-1', code: 'MCA' },
      disciplines: [{ id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'Arsitektur' }],
      clashes: [
        { id: 'c1', projectId: 'proj-1', disciplineId: 'd1', seq: 1, uniqueCode: 'MCA-ARS-0001', deletedAt: null },
        {
          id: 'c2',
          projectId: 'proj-1',
          disciplineId: 'd1',
          seq: 2,
          uniqueCode: 'MCA-ARS-0002',
          deletedAt: new Date(),
        },
      ],
    });

    const result = await service.updateDiscipline('d1', { code: 'me' }, 'proj-1', ACTOR);

    expect(result.code).toBe('ME');
    expect(disciplines[0].code).toBe('ME');
    expect(auditRows).toHaveLength(2);
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clashId: 'c1',
          action: 'code_changed',
          field: 'uniqueCode',
          oldValue: 'MCA-ARS-0001',
          newValue: 'MCA-ME-0001',
          actorId: ACTOR.id,
        }),
        expect.objectContaining({
          clashId: 'c2',
          oldValue: 'MCA-ARS-0002',
          newValue: 'MCA-ME-0002',
        }),
      ]),
    );
  });

  it('rejects when the new codes would collide with a live clash in a DIFFERENT discipline (pre-check)', async () => {
    const { service, auditRows } = makeDisciplineRenameHarness({
      project: { id: 'proj-1', code: 'MCA' },
      disciplines: [
        { id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'Arsitektur' },
        { id: 'd2', projectId: 'proj-1', code: 'ME', name: 'Mekanikal (lama)' },
      ],
      clashes: [
        { id: 'c1', projectId: 'proj-1', disciplineId: 'd1', seq: 1, uniqueCode: 'MCA-ARS-0001', deletedAt: null },
        // Already occupies the code d1's rename would produce.
        { id: 'c2', projectId: 'proj-1', disciplineId: 'd2', seq: 1, uniqueCode: 'MCA-ME-0001', deletedAt: null },
      ],
    });

    await expect(service.updateDiscipline('d1', { code: 'me' }, 'proj-1', ACTOR)).rejects.toThrow(
      ConflictException,
    );
    expect(auditRows).toHaveLength(0);
  });

  it('converts a P2002 from the raw UPDATE itself into a 409 (concurrent-insert backstop)', async () => {
    const { service } = makeDisciplineRenameHarness({
      project: { id: 'proj-1', code: 'MCA' },
      disciplines: [{ id: 'd1', projectId: 'proj-1', code: 'ARS', name: 'Arsitektur' }],
      clashes: [
        { id: 'c1', projectId: 'proj-1', disciplineId: 'd1', seq: 1, uniqueCode: 'MCA-ARS-0001', deletedAt: null },
      ],
      throwP2002OnExecuteRaw: true,
    });

    await expect(service.updateDiscipline('d1', { code: 'me' }, 'proj-1', ACTOR)).rejects.toThrow(
      ConflictException,
    );
  });
});
