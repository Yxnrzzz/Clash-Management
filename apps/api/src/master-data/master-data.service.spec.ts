import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { PrismaService } from '../prisma/prisma.service';

const FROM_PROJECT = { id: 'proj-1', code: 'MCA' };
const TO_PROJECT = { id: 'proj-2', code: 'MCB' };

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
        Promise.resolve([FROM_PROJECT, TO_PROJECT].find((p) => p.id === id) ?? null),
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
});
