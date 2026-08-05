import { Readable } from 'stream';
import type { Job } from 'bullmq';
import { ImportJobStatus } from '@prisma/client';
import { ImportProcessor } from './import.processor';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClashesService, DuplicateExternalIdError } from '../clashes/clashes.service';
import type { ImportJobPayload, ImportMapping, RowError } from './import.types';

const PROJECT = { id: 'proj-1', code: 'MCA' };
const OPEN_STATUS = { id: 'st-open', sequence: 1 };

const DEFAULT_MAPPING: ImportMapping = {
  title: 'judul',
  disciplineCode: 'disiplin',
  zoneName: 'zona',
  priorityName: 'prioritas',
  description: 'deskripsi',
  dueDate: 'due_date',
  externalId: 'external_id',
};

function makeJob(): Job<ImportJobPayload> {
  return { data: { jobId: 'job-1' } } as unknown as Job<ImportJobPayload>;
}

/**
 * Hand-rolled Prisma/Storage/ClashesService mock, in the same spirit as
 * clashes.service.spec.ts — enough to drive ImportProcessor.process() through
 * a full run without a real database or file on disk.
 */
function makeHarness(opts: {
  csvText: string;
  mapping?: ImportMapping;
  autoCreate?: boolean;
  disciplines?: { id: string; code: string; name: string }[];
  zones?: { id: string; name: string; level: string }[];
  priorities?: { id: string; name: string; weight: number }[];
  existingExternalIds?: string[];
  noOpenStatus?: boolean;
}) {
  const importJobRow = {
    id: 'job-1',
    projectId: PROJECT.id,
    createdById: 'u-coord',
    fileName: 'test.csv',
    storageKey: 'imports/test.csv',
    format: 'csv',
    mapping: opts.mapping ?? DEFAULT_MAPPING,
    autoCreate: opts.autoCreate ?? false,
    status: ImportJobStatus.QUEUED as ImportJobStatus,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    skippedRows: 0,
    errors: [] as RowError[],
  };

  const importJobDelegate = {
    findUnique: jest.fn(() => Promise.resolve(importJobRow)),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(importJobRow, data);
      return Promise.resolve(importJobRow);
    }),
  };

  const disciplines = [...(opts.disciplines ?? [])];
  const zones = [...(opts.zones ?? [])];
  const priorities = [...(opts.priorities ?? [])];
  const existingExternalIds = new Set(opts.existingExternalIds ?? []);

  const disciplineDelegate = {
    findMany: jest.fn(() => Promise.resolve(disciplines)),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `disc-new-${disciplines.length + 1}`, ...data }),
    ),
  };
  const zoneDelegate = {
    findMany: jest.fn(() => Promise.resolve(zones)),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `zone-new-${zones.length + 1}`, ...data }),
    ),
  };
  const priorityDelegate = {
    findMany: jest.fn(() => Promise.resolve(priorities)),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: `pr-new-${priorities.length + 1}`, ...data }),
    ),
  };
  const clashDelegate = {
    findFirst: jest.fn(({ where }: { where: { externalId?: string } }) =>
      Promise.resolve(
        where.externalId && existingExternalIds.has(where.externalId) ? { id: 'existing' } : null,
      ),
    ),
  };
  const statusDelegate = {
    findFirst: jest.fn(() => Promise.resolve(opts.noOpenStatus ? null : OPEN_STATUS)),
  };
  const projectDelegate = { findUniqueOrThrow: jest.fn(() => Promise.resolve(PROJECT)) };

  const prisma = {
    importJob: importJobDelegate,
    project: projectDelegate,
    status: statusDelegate,
    discipline: disciplineDelegate,
    zone: zoneDelegate,
    priority: priorityDelegate,
    clash: clashDelegate,
  } as unknown as PrismaService;

  const storage = {
    readStream: jest.fn(() => Readable.from([Buffer.from(opts.csvText, 'utf-8')])),
  } as unknown as StorageService;

  const created: Record<string, unknown>[] = [];
  const clashes = {
    // Marks the row's externalId as taken immediately after "creating" it, so
    // a second row in the same file referencing the same externalId is
    // caught by importRow's pre-check exactly like two sequential real
    // Prisma writes would.
    createClashRecord: jest.fn((input: Record<string, unknown>) => {
      const externalId = input.externalId as string | null | undefined;
      if (externalId) existingExternalIds.add(externalId);
      created.push(input);
      return Promise.resolve({ id: `clash-${created.length}`, ...input });
    }),
  } as unknown as ClashesService;

  const processor = new ImportProcessor(prisma, storage, clashes);

  return { processor, importJobRow, disciplineDelegate, zoneDelegate, priorityDelegate, clashes, created };
}

describe('ImportProcessor — mixed valid/invalid rows', () => {
  it('creates the valid rows and reports the invalid ones without aborting the batch', async () => {
    const csv = [
      'judul,disiplin,zona,prioritas,deskripsi,due_date,external_id',
      'Bentrok pipa AC,MEP,Lantai 2 Zona A,High,Ditemukan saat koordinasi,,',
      ',MEP,Lantai 2 Zona A,High,Judul kosong,,',
      'Dinding partisi,DISIPLIN-TIDAK-ADA,Lantai 1 Zona B,Medium,Disiplin tak dikenal,,',
    ].join('\n');

    const { processor, importJobRow, created } = makeHarness({
      csvText: csv,
      disciplines: [{ id: 'disc-mep', code: 'MEP', name: 'Mekanikal' }],
      zones: [{ id: 'zone-a', name: 'Lantai 2 Zona A', level: '-' }],
      priorities: [
        { id: 'pr-high', name: 'High', weight: 3 },
        { id: 'pr-med', name: 'Medium', weight: 2 },
      ],
    });

    await processor.process(makeJob());

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: 'Bentrok pipa AC', auditAction: 'imported' });

    expect(importJobRow.status).toBe(ImportJobStatus.DONE);
    expect(importJobRow.succeededRows).toBe(1);
    expect(importJobRow.failedRows).toBe(2);
    expect(importJobRow.skippedRows).toBe(0);

    const errors = importJobRow.errors as unknown as RowError[];
    expect(errors).toEqual([
      { rowNumber: 3, reason: 'Judul kosong' },
      { rowNumber: 4, reason: 'Disiplin tidak ditemukan: "DISIPLIN-TIDAK-ADA"' },
    ]);
  });
});

describe('ImportProcessor — dedup by external_id', () => {
  it('imports the first row and skips a later row sharing the same external_id', async () => {
    const csv = [
      'judul,disiplin,zona,prioritas,deskripsi,due_date,external_id',
      'Clash A,MEP,Zona A,High,Deskripsi A,,EXT-100',
      'Clash A duplikat,MEP,Zona A,High,Deskripsi B,,EXT-100',
    ].join('\n');

    const { processor, importJobRow, created } = makeHarness({
      csvText: csv,
      disciplines: [{ id: 'disc-mep', code: 'MEP', name: 'Mekanikal' }],
      zones: [{ id: 'zone-a', name: 'Zona A', level: '-' }],
      priorities: [{ id: 'pr-high', name: 'High', weight: 3 }],
    });

    await processor.process(makeJob());

    expect(created).toHaveLength(1);
    expect(importJobRow.succeededRows).toBe(1);
    expect(importJobRow.skippedRows).toBe(1);
    expect(importJobRow.failedRows).toBe(0);
  });

  it('skips every row when re-running the same file against externalIds that already exist', async () => {
    const csv = [
      'judul,disiplin,zona,prioritas,deskripsi,due_date,external_id',
      'Clash A,MEP,Zona A,High,Deskripsi A,,EXT-100',
    ].join('\n');

    const { processor, importJobRow, created } = makeHarness({
      csvText: csv,
      disciplines: [{ id: 'disc-mep', code: 'MEP', name: 'Mekanikal' }],
      zones: [{ id: 'zone-a', name: 'Zona A', level: '-' }],
      priorities: [{ id: 'pr-high', name: 'High', weight: 3 }],
      existingExternalIds: ['EXT-100'],
    });

    await processor.process(makeJob());

    expect(created).toHaveLength(0);
    expect(importJobRow.skippedRows).toBe(1);
    expect(importJobRow.succeededRows).toBe(0);
  });
});

describe('ImportProcessor — auto-create master data', () => {
  const csv = [
    'judul,disiplin,zona,prioritas,deskripsi,due_date,external_id',
    'Clash baru,PLB,Zona Baru,Urgent,Deskripsi,,',
  ].join('\n');

  it('fails the row when the master data is unknown and autoCreate is off', async () => {
    const { processor, importJobRow, created, disciplineDelegate } = makeHarness({
      csvText: csv,
      autoCreate: false,
    });

    await processor.process(makeJob());

    expect(created).toHaveLength(0);
    expect(disciplineDelegate.create).not.toHaveBeenCalled();
    expect(importJobRow.failedRows).toBe(1);
    expect((importJobRow.errors as unknown as RowError[])[0].reason).toContain('Disiplin tidak ditemukan');
  });

  it('creates the missing discipline/zone/priority and the clash when autoCreate is on', async () => {
    const { processor, importJobRow, created, disciplineDelegate, zoneDelegate, priorityDelegate } =
      makeHarness({ csvText: csv, autoCreate: true });

    await processor.process(makeJob());

    expect(disciplineDelegate.create).toHaveBeenCalledWith({
      data: { projectId: PROJECT.id, code: 'PLB', name: 'PLB' },
    });
    expect(zoneDelegate.create).toHaveBeenCalledWith({
      data: { projectId: PROJECT.id, name: 'Zona Baru', level: '-' },
    });
    expect(priorityDelegate.create).toHaveBeenCalledWith({ data: { name: 'Urgent', weight: 1 } });

    expect(created).toHaveLength(1);
    expect(importJobRow.succeededRows).toBe(1);
    expect(importJobRow.status).toBe(ImportJobStatus.DONE);
  });
});

describe('ImportProcessor — unexpected failures', () => {
  it('marks the job FAILED with a row-0 error when something throws outside the per-row loop', async () => {
    const { processor, importJobRow } = makeHarness({
      csvText: 'judul,disiplin\nA,MEP',
      noOpenStatus: true,
    });

    await processor.process(makeJob());

    expect(importJobRow.status).toBe(ImportJobStatus.FAILED);
    const errors = importJobRow.errors as unknown as RowError[];
    expect(errors[0].rowNumber).toBe(0);
    expect(errors[0].reason).toContain('status');
  });
});

describe('DuplicateExternalIdError race defense', () => {
  it('treats a DuplicateExternalIdError from createClashRecord as skipped, not failed', async () => {
    const csv = [
      'judul,disiplin,zona,prioritas,deskripsi,due_date,external_id',
      'Clash A,MEP,Zona A,High,Deskripsi A,,EXT-RACE',
    ].join('\n');

    const { processor, importJobRow, clashes } = makeHarness({
      csvText: csv,
      disciplines: [{ id: 'disc-mep', code: 'MEP', name: 'Mekanikal' }],
      zones: [{ id: 'zone-a', name: 'Zona A', level: '-' }],
      priorities: [{ id: 'pr-high', name: 'High', weight: 3 }],
    });
    (clashes.createClashRecord as jest.Mock).mockRejectedValue(
      new DuplicateExternalIdError('race'),
    );

    await processor.process(makeJob());

    expect(importJobRow.skippedRows).toBe(1);
    expect(importJobRow.failedRows).toBe(0);
  });
});
