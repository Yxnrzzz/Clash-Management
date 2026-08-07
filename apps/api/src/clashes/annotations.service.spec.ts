import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnotationKind, Role } from '@prisma/client';
import { AnnotationsService } from './annotations.service';
import { ClashesService } from './clashes.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/auth.types';

const fakeStorage = {} as unknown as StorageService;
const fakeNotifications = {} as unknown as NotificationsService;

const PROJECT_ID = 'proj-1';
const CLASH_ID = 'clash-1';
const ATTACHMENT_ID = 'att-1';

const engineer: AuthUser = { id: 'u-eng', email: 'engineer@clashhub.dev', role: Role.ENGINEER };
const otherEngineer: AuthUser = { id: 'u-eng2', email: 'rizky@clashhub.dev', role: Role.ENGINEER };
const coordinator: AuthUser = { id: 'u-coord', email: 'coordinator@clashhub.dev', role: Role.COORDINATOR };

function baseClash(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CLASH_ID,
    projectId: PROJECT_ID,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

function baseAttachment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTACHMENT_ID,
    clashId: CLASH_ID,
    ...overrides,
  };
}

/** Same hand-rolled Prisma mock spirit as clashes.service.spec.ts. */
function makeHarness(opts: {
  clash?: ReturnType<typeof baseClash> | null;
  attachment?: ReturnType<typeof baseAttachment> | null;
  annotation?: Record<string, unknown> | null;
}) {
  const clash = opts.clash === undefined ? baseClash() : opts.clash;
  const attachmentRow = opts.attachment === undefined ? baseAttachment() : opts.attachment;

  const clashDelegate = {
    findFirst: jest.fn(() => Promise.resolve(clash)),
  };
  const attachmentDelegate = {
    findUnique: jest.fn(() => Promise.resolve(attachmentRow)),
  };
  const annotationDelegate = {
    findMany: jest.fn(() => Promise.resolve([])),
    findUnique: jest.fn(() => Promise.resolve(opts.annotation ?? null)),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'ann-1', createdAt: new Date(), updatedAt: new Date(), ...data }),
    ),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      Promise.resolve({ ...opts.annotation, ...data, id: where.id }),
    ),
    delete: jest.fn(),
  };

  const prisma = {
    clash: clashDelegate,
    attachment: attachmentDelegate,
    annotation: annotationDelegate,
  } as unknown as PrismaService;

  const clashesService = new ClashesService(prisma, fakeStorage, fakeNotifications);
  const service = new AnnotationsService(prisma, clashesService);

  return { service, clashDelegate, attachmentDelegate, annotationDelegate };
}

const validRectGeometry = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

describe('AnnotationsService.create', () => {
  it('creates an annotation with valid RECT geometry', async () => {
    const { service, annotationDelegate } = makeHarness({});

    const result = await service.create(
      CLASH_ID,
      ATTACHMENT_ID,
      { kind: AnnotationKind.RECT, geometry: validRectGeometry },
      engineer,
      PROJECT_ID,
    );

    expect(annotationDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attachmentId: ATTACHMENT_ID,
        authorId: 'u-eng',
        kind: AnnotationKind.RECT,
        geometry: validRectGeometry,
        pageNumber: 1,
      }),
    });
    expect(result.authorId).toBe('u-eng');
  });

  it('throws NotFoundException when the attachment belongs to a different clash', async () => {
    const { service } = makeHarness({ attachment: baseAttachment({ clashId: 'clash-other' }) });

    await expect(
      service.create(CLASH_ID, ATTACHMENT_ID, { kind: AnnotationKind.RECT, geometry: validRectGeometry }, engineer, PROJECT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the clash belongs to a soft-deleted/other-project clash', async () => {
    const { service } = makeHarness({ clash: null });

    await expect(
      service.create(CLASH_ID, ATTACHMENT_ID, { kind: AnnotationKind.RECT, geometry: validRectGeometry }, engineer, PROJECT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a coordinate outside [0,1]', async () => {
    const { service } = makeHarness({});

    await expect(
      service.create(
        CLASH_ID,
        ATTACHMENT_ID,
        { kind: AnnotationKind.RECT, geometry: { x: 1.5, y: 0.2, w: 0.3, h: 0.4 } },
        engineer,
        PROJECT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a NaN coordinate', async () => {
    const { service } = makeHarness({});

    await expect(
      service.create(
        CLASH_ID,
        ATTACHMENT_ID,
        { kind: AnnotationKind.RECT, geometry: { x: Number.NaN, y: 0.2, w: 0.3, h: 0.4 } },
        engineer,
        PROJECT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a freehand stroke with more than 2000 points', async () => {
    const { service } = makeHarness({});
    const points = Array.from({ length: 2001 }, () => [0.1, 0.1]);

    await expect(
      service.create(CLASH_ID, ATTACHMENT_ID, { kind: AnnotationKind.FREEHAND, geometry: { points } }, engineer, PROJECT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a freehand stroke within the point cap', async () => {
    const { service, annotationDelegate } = makeHarness({});
    const points = Array.from({ length: 500 }, (_, i) => [i / 1000, i / 1000]);

    await service.create(
      CLASH_ID,
      ATTACHMENT_ID,
      { kind: AnnotationKind.FREEHAND, geometry: { points } },
      engineer,
      PROJECT_ID,
    );

    expect(annotationDelegate.create).toHaveBeenCalled();
  });

  it('rejects an oversized geometry payload regardless of point count', async () => {
    const { service } = makeHarness({});
    // An oversized filler key forces the 64KB cap to trip independently of
    // the 2000-point cap tested above.
    const geometry = { points: [[0.1, 0.1]], filler: 'x'.repeat(70_000) };

    await expect(
      service.create(CLASH_ID, ATTACHMENT_ID, { kind: AnnotationKind.FREEHAND, geometry }, engineer, PROJECT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a RECT with zero width', async () => {
    const { service } = makeHarness({});

    await expect(
      service.create(
        CLASH_ID,
        ATTACHMENT_ID,
        { kind: AnnotationKind.RECT, geometry: { x: 0.1, y: 0.1, w: 0, h: 0.2 } },
        engineer,
        PROJECT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AnnotationsService.update / remove — authorship', () => {
  const existing = { id: 'ann-1', attachmentId: ATTACHMENT_ID, authorId: 'u-eng', kind: AnnotationKind.RECT };

  it('allows the author (Engineer) to edit their own annotation', async () => {
    const { service, annotationDelegate } = makeHarness({ annotation: existing });

    await service.update(CLASH_ID, ATTACHMENT_ID, 'ann-1', { color: '#00ff00' }, engineer, PROJECT_ID);

    expect(annotationDelegate.update).toHaveBeenCalledWith({
      where: { id: 'ann-1' },
      data: { color: '#00ff00' },
    });
  });

  it('rejects another Engineer editing someone else\'s annotation', async () => {
    const { service } = makeHarness({ annotation: existing });

    await expect(
      service.update(CLASH_ID, ATTACHMENT_ID, 'ann-1', { color: '#00ff00' }, otherEngineer, PROJECT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows Coordinator to edit any annotation', async () => {
    const { service, annotationDelegate } = makeHarness({ annotation: existing });

    await service.update(CLASH_ID, ATTACHMENT_ID, 'ann-1', { color: '#00ff00' }, coordinator, PROJECT_ID);

    expect(annotationDelegate.update).toHaveBeenCalled();
  });

  it('allows the author to delete their own annotation', async () => {
    const { service, annotationDelegate } = makeHarness({ annotation: existing });

    const result = await service.remove(CLASH_ID, ATTACHMENT_ID, 'ann-1', engineer, PROJECT_ID);

    expect(result).toEqual({ id: 'ann-1' });
    expect(annotationDelegate.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
  });

  it('rejects another Engineer deleting someone else\'s annotation', async () => {
    const { service, annotationDelegate } = makeHarness({ annotation: existing });

    await expect(service.remove(CLASH_ID, ATTACHMENT_ID, 'ann-1', otherEngineer, PROJECT_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(annotationDelegate.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the annotation belongs to a different attachment', async () => {
    const { service } = makeHarness({
      annotation: { ...existing, attachmentId: 'att-other' },
    });

    await expect(service.remove(CLASH_ID, ATTACHMENT_ID, 'ann-1', engineer, PROJECT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the annotation id does not exist at all', async () => {
    const { service } = makeHarness({ annotation: null });

    await expect(service.remove(CLASH_ID, ATTACHMENT_ID, 'ann-ghost', engineer, PROJECT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AnnotationsService.list', () => {
  it('lists annotations for the attachment, ordered by createdAt', async () => {
    const { service, annotationDelegate } = makeHarness({});

    await service.list(CLASH_ID, ATTACHMENT_ID, PROJECT_ID);

    expect(annotationDelegate.findMany).toHaveBeenCalledWith({
      where: { attachmentId: ATTACHMENT_ID },
      orderBy: { createdAt: 'asc' },
    });
  });
});
