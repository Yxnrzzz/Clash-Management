import { Readable } from 'stream';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ImportService } from './import.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';

const PROJECT = { id: 'proj-1', code: 'MCA', createdAt: new Date('2026-01-01') };
const admin: AuthUser = { id: 'u-admin', email: 'admin@clashhub.dev', role: Role.ADMIN };
const coordinator: AuthUser = { id: 'u-coord', email: 'coordinator@clashhub.dev', role: Role.COORDINATOR };

function makeHarness(opts: { storedFileText?: string } = {}) {
  const importJobCreate = jest.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'job-1', ...data }),
  );
  const importJobFindUnique = jest.fn();

  const prisma = {
    project: { findFirst: jest.fn(() => Promise.resolve(PROJECT)) },
    importJob: { create: importJobCreate, findUnique: importJobFindUnique },
  } as unknown as PrismaService;

  const storage = {
    save: jest.fn(() => Promise.resolve({ key: 'imports/uuid-file.csv' })),
    readStream: jest.fn(() =>
      Readable.from([Buffer.from(opts.storedFileText ?? 'judul,disiplin\nA,MEP', 'utf-8')]),
    ),
  } as unknown as StorageService;

  const queueAdd = jest.fn(() => Promise.resolve());
  const queue = { add: queueAdd } as unknown as import('bullmq').Queue;

  const service = new ImportService(prisma, storage, queue);
  return { service, prisma, storage, queueAdd, importJobCreate, importJobFindUnique };
}

const VALID_MAPPING = {
  title: 'judul',
  disciplineCode: 'disiplin',
  zoneName: 'zona',
  priorityName: 'prioritas',
  description: 'deskripsi',
};

describe('ImportService.preview', () => {
  it('parses the file, stores it, and returns a suggested mapping', async () => {
    const { service, storage } = makeHarness();
    const file = {
      originalname: 'clashes.csv',
      buffer: Buffer.from('judul,disiplin,zona,prioritas,deskripsi\nA,MEP,Z1,High,Desc', 'utf-8'),
    } as Express.Multer.File;

    const result = await service.preview(file);

    expect(storage.save).toHaveBeenCalledWith(file.buffer, 'imports', 'clashes.csv');
    expect(result.token).toBe('imports/uuid-file.csv');
    expect(result.format).toBe('csv');
    expect(result.columns).toEqual(['judul', 'disiplin', 'zona', 'prioritas', 'deskripsi']);
    expect(result.totalRows).toBe(1);
    expect(result.suggestedMapping.title).toBe('judul');
    expect(result.suggestedMapping.disciplineCode).toBe('disiplin');
  });

  it('rejects a missing file', async () => {
    const { service } = makeHarness();
    await expect(service.preview(undefined)).rejects.toThrow(BadRequestException);
  });

  it('rejects a file with no readable columns', async () => {
    const { service } = makeHarness();
    const file = { originalname: 'empty.csv', buffer: Buffer.from('', 'utf-8') } as Express.Multer.File;
    await expect(service.preview(file)).rejects.toThrow(BadRequestException);
  });
});

describe('ImportService.commit — autoCreateMasterData gate', () => {
  it('rejects a non-Admin trying to enable autoCreateMasterData', async () => {
    const { service } = makeHarness();

    await expect(
      service.commit(
        { token: 'imports/x.csv', fileName: 'x.csv', mapping: VALID_MAPPING, autoCreateMasterData: true },
        coordinator,
        PROJECT.id,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an Admin to enable autoCreateMasterData and enqueues the job', async () => {
    const { service, importJobCreate, queueAdd } = makeHarness();

    const result = await service.commit(
      { token: 'imports/x.csv', fileName: 'x.csv', mapping: VALID_MAPPING, autoCreateMasterData: true },
      admin,
      PROJECT.id,
    );

    expect(importJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        autoCreate: true,
        createdById: admin.id,
        totalRows: 1,
        projectId: PROJECT.id,
      }),
    });
    expect(queueAdd).toHaveBeenCalledWith('process', { jobId: 'job-1' });
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('allows a Coordinator to commit without autoCreateMasterData', async () => {
    const { service, importJobCreate } = makeHarness();

    const result = await service.commit(
      { token: 'imports/x.csv', fileName: 'x.csv', mapping: VALID_MAPPING },
      coordinator,
      PROJECT.id,
    );

    expect(importJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ autoCreate: false }),
    });
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('rejects a file with no data rows', async () => {
    const { service } = makeHarness({ storedFileText: 'judul,disiplin' });

    await expect(
      service.commit({ token: 'imports/x.csv', fileName: 'x.csv', mapping: VALID_MAPPING }, admin, PROJECT.id),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ImportService.getJob — access scoping', () => {
  it('lets the job creator read their own job', async () => {
    const { service, importJobFindUnique } = makeHarness();
    importJobFindUnique.mockResolvedValue({ id: 'job-1', createdById: coordinator.id });

    const job = await service.getJob('job-1', coordinator);
    expect(job.id).toBe('job-1');
  });

  it('lets an Admin read any job', async () => {
    const { service, importJobFindUnique } = makeHarness();
    importJobFindUnique.mockResolvedValue({ id: 'job-1', createdById: coordinator.id });

    const job = await service.getJob('job-1', admin);
    expect(job.id).toBe('job-1');
  });

  it('rejects a different Coordinator reading someone else\'s job', async () => {
    const { service, importJobFindUnique } = makeHarness();
    const otherCoordinator: AuthUser = { id: 'u-coord-2', email: 'x@clashhub.dev', role: Role.COORDINATOR };
    importJobFindUnique.mockResolvedValue({ id: 'job-1', createdById: coordinator.id });

    await expect(service.getJob('job-1', otherCoordinator)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for a missing job', async () => {
    const { service, importJobFindUnique } = makeHarness();
    importJobFindUnique.mockResolvedValue(null);

    await expect(service.getJob('missing', admin)).rejects.toThrow(NotFoundException);
  });
});
