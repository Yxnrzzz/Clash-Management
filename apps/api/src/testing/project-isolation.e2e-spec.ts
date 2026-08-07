import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { ClashesModule } from '../clashes/clashes.module';
import { MasterDataModule } from '../master-data/master-data.module';
import { ProjectsModule } from '../projects/projects.module';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectContextGuard } from '../common/guards/project-context.guard';
import { NOTIFICATIONS_QUEUE } from '../notifications/notifications.types';
import { NotificationsProcessor } from '../notifications/notifications.processor';

/**
 * Proves the multi-project authorization boundary end-to-end over real HTTP
 * (real Express routing, real guards/decorators/DTO validation) — the thing
 * that matters for IDOR is exactly the stuff a plain service-level unit test
 * can't see: the URL param, the X-Project-Id header, and the request body/
 * query as an attacker would actually send them.
 *
 * Prisma is an in-memory fake (same spirit as the other *.spec.ts files in
 * this codebase) so this needs no real Postgres/Redis — only ClashesModule/
 * MasterDataModule/ProjectsModule are wired up, not ImportModule (which
 * would require a live BullMQ/Redis connection to bootstrap). ClashesModule
 * transitively pulls in NotificationsModule (for enqueueing on
 * assign/status-change) and StorageModule (for attachments), which need a
 * real ConfigService and the BullMQ queue provider respectively —
 * ConfigModule.forRoot() supplies the former; the queue token is overridden
 * below with a stub rather than connecting to Redis, since nothing here
 * exercises notification delivery.
 */

// --- Fixtures: two isolated projects ----------------------------------------

const PROJECT_A = { id: 'proj-a', name: 'Project A', code: 'AAA' };
const PROJECT_B = { id: 'proj-b', name: 'Project B', code: 'BBB' };

// BulkUpdateClashDto validates `ids` with @IsUUID — a human-readable id like
// "clash-a" would 400 before the request ever reaches the service, so the
// clash fixtures need real UUID-shaped ids (unlike project/discipline/zone
// ids above, which no DTO in this suite validates as UUIDs).
const CLASH_A_ID = 'c1a10000-0000-4000-8000-000000000001';
const CLASH_B_ID = 'c1a10000-0000-4000-8000-000000000002';

const ENGINEER_A = { id: 'u-eng-a', role: Role.ENGINEER };
const ENGINEER_B = { id: 'u-eng-b', role: Role.ENGINEER };
const COORDINATOR = { id: 'u-coord', role: Role.COORDINATOR };
const ADMIN = { id: 'u-admin', role: Role.ADMIN };

// Only Engineers hold explicit ProjectMember rows — Coordinator/Admin reach
// every project via ProjectContextGuard's CROSS_PROJECT_ROLES bypass.
const MEMBERSHIPS = [
  { projectId: PROJECT_A.id, userId: ENGINEER_A.id },
  { projectId: PROJECT_B.id, userId: ENGINEER_B.id },
];

const DISCIPLINES = [
  { id: 'disc-a', projectId: PROJECT_A.id, code: 'ARS', name: 'Arsitektur', isActive: true },
  { id: 'disc-b', projectId: PROJECT_B.id, code: 'ARS', name: 'Arsitektur', isActive: true },
];
const ZONES = [
  { id: 'zone-a', projectId: PROJECT_A.id, name: 'Zona A', level: 'L1', isActive: true },
  { id: 'zone-b', projectId: PROJECT_B.id, name: 'Zona B', level: 'L1', isActive: true },
];
const STATUSES = [
  { id: 'st-open', name: 'Open', sequence: 1, isClosedState: false },
  { id: 'st-inprogress', name: 'In Progress', sequence: 2, isClosedState: false },
];
const PRIORITIES = [{ id: 'pr-low', name: 'Low', weight: 1 }];

type ClashFixture = {
  id: string;
  projectId: string;
  disciplineId: string;
  zoneId: string;
  reporterId: string;
  assigneeId: string | null;
  uniqueCode: string;
  title: string;
  description: string;
  statusId: string;
  priorityId: string;
  dueDate: Date | null;
  createdAt: Date;
  closedAt: Date | null;
  externalId: string | null;
};

function makeClash(
  overrides: Pick<
    ClashFixture,
    'id' | 'projectId' | 'disciplineId' | 'zoneId' | 'reporterId' | 'assigneeId'
  > &
    Partial<ClashFixture>,
): ClashFixture {
  return {
    uniqueCode: `${overrides.projectId}-CODE`,
    title: 'Judul',
    description: 'Deskripsi',
    statusId: 'st-open',
    priorityId: 'pr-low',
    dueDate: null,
    createdAt: new Date('2026-07-01'),
    closedAt: null,
    externalId: null,
    ...overrides,
  };
}

// --- Test-only auth guard: no real JWT needed, just headers -----------------

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-test-user-id'];
    const role = request.headers['x-test-user-role'];
    if (userId && role) {
      request.user = { id: userId, email: `${userId}@test.local`, role };
    }
    return true;
  }
}

function authHeaders(user: { id: string; role: Role }, projectId?: string) {
  const headers: Record<string, string> = {
    'x-test-user-id': user.id,
    'x-test-user-role': user.role,
  };
  if (projectId) headers['x-project-id'] = projectId;
  return headers;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    ClashesModule,
    MasterDataModule,
    ProjectsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TestAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ProjectContextGuard },
  ],
})
class TestAppModule {}

describe('Multi-project isolation (IDOR)', () => {
  let app: INestApplication;
  let clashes: ReturnType<typeof makeClash>[];

  beforeEach(async () => {
    clashes = [
      makeClash({
        id: CLASH_A_ID,
        projectId: PROJECT_A.id,
        disciplineId: 'disc-a',
        zoneId: 'zone-a',
        reporterId: ENGINEER_A.id,
        assigneeId: ENGINEER_A.id,
      }),
      makeClash({
        id: CLASH_B_ID,
        projectId: PROJECT_B.id,
        disciplineId: 'disc-b',
        zoneId: 'zone-b',
        reporterId: ENGINEER_B.id,
        assigneeId: ENGINEER_B.id,
      }),
    ];

    // Declared outside the fakePrisma object literal (rather than as a
    // nested proxy function) so both the top-level delegate and
    // $transaction's tx.clash below can reference the same jest.fn mocks
    // without a self-referential type (fakePrisma's own type depending on
    // a function that reads fakePrisma.clash) that TypeScript can't infer.
    const clashMock = {
      findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(clashes.find((c) => c.id === id) ?? null),
      ),
      // assertClashInProject uses findFirst (not findUnique) so it can add
      // a deletedAt filter to the where clause — see clashes.service.ts.
      // None of these fixtures are soft-deleted, so id lookup is enough.
      findFirst: jest.fn(({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(clashes.find((c) => c.id === id) ?? null),
      ),
      findMany: jest.fn(
        ({ where }: { where: { projectId?: string; id?: { in: string[] } } }) =>
          Promise.resolve(
            clashes.filter(
              (c) =>
                (!where.projectId || c.projectId === where.projectId) &&
                (!where.id || where.id.in.includes(c.id)),
            ),
          ),
      ),
      count: jest.fn(({ where }: { where: { projectId?: string } }) =>
        Promise.resolve(
          clashes.filter((c) => !where.projectId || c.projectId === where.projectId).length,
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Partial<ClashFixture> }) => {
          const idx = clashes.findIndex((c) => c.id === where.id);
          clashes[idx] = { ...clashes[idx], ...data };
          return Promise.resolve(clashes[idx]);
        },
      ),
      create: jest.fn(),
    };

    const fakePrisma = {
      project: {
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve([PROJECT_A, PROJECT_B].find((p) => p.id === id) ?? null),
        ),
        findFirst: jest.fn(() => Promise.resolve(PROJECT_A)),
        findMany: jest.fn(() => Promise.resolve([PROJECT_A, PROJECT_B])),
      },
      projectMember: {
        findUnique: jest.fn(
          ({ where: { projectId_userId } }: { where: { projectId_userId: { projectId: string; userId: string } } }) =>
            Promise.resolve(
              MEMBERSHIPS.find(
                (m) =>
                  m.projectId === projectId_userId.projectId && m.userId === projectId_userId.userId,
              ) ?? null,
            ),
        ),
      },
      discipline: {
        findMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) =>
          Promise.resolve(DISCIPLINES.filter((d) => d.projectId === projectId)),
        ),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(DISCIPLINES.find((d) => d.id === id) ?? null),
        ),
      },
      zone: {
        findMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) =>
          Promise.resolve(ZONES.filter((z) => z.projectId === projectId)),
        ),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(ZONES.find((z) => z.id === id) ?? null),
        ),
      },
      priority: {
        findMany: jest.fn(() => Promise.resolve(PRIORITIES)),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(PRIORITIES.find((p) => p.id === id) ?? null),
        ),
      },
      status: {
        findMany: jest.fn(() => Promise.resolve(STATUSES)),
        findFirst: jest.fn(() => Promise.resolve(STATUSES[0])),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(STATUSES.find((s) => s.id === id) ?? null),
        ),
      },
      user: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      clash: clashMock,
      comment: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'c-1', ...data })),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      attachment: {
        findMany: jest.fn(() => Promise.resolve([])),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({ clash: clashMock, auditLog: { createMany: jest.fn() } }),
      ),
    };

    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(getQueueToken(NOTIFICATIONS_QUEUE))
      .useValue({ add: jest.fn() })
      // useValue() clears wrapper.metatype, which is how @nestjs/bullmq's
      // BullExplorer normally finds the @Processor() class to spin up a
      // real Worker for — without this, app.init() tries to open an actual
      // Redis connection ("Worker requires a connection"). Nothing here
      // exercises notification delivery, so a stub is enough.
      .overrideProvider(NotificationsProcessor)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a request with no X-Project-Id header at all', async () => {
    await request(app.getHttpServer())
      .get('/clashes')
      .set(authHeaders(ENGINEER_A))
      .expect(403);
  });

  it('rejects a non-member sending another project\'s id via the X-Project-Id header', async () => {
    await request(app.getHttpServer())
      .get('/clashes')
      .set(authHeaders(ENGINEER_A, PROJECT_B.id))
      .expect(403);
  });

  it('404s when the URL id belongs to a different project than the active header (id swap)', async () => {
    await request(app.getHttpServer())
      .get(`/clashes/${CLASH_B_ID}`)
      .set(authHeaders(ENGINEER_A, PROJECT_A.id))
      .expect(404);
  });

  it('404s a PATCH update targeting a clash id from another project', async () => {
    await request(app.getHttpServer())
      .patch(`/clashes/${CLASH_B_ID}`)
      .set(authHeaders(ENGINEER_A, PROJECT_A.id))
      .send({ statusId: 'st-inprogress' })
      .expect(404);
  });

  it('404s adding a comment to a clash id from another project', async () => {
    await request(app.getHttpServer())
      .post(`/clashes/${CLASH_B_ID}/comments`)
      .set(authHeaders(ENGINEER_A, PROJECT_A.id))
      .send({ content: 'halo' })
      .expect(404);
  });

  it('rejects a bulk update whose id list smuggles in a clash from another project (body injection)', async () => {
    await request(app.getHttpServer())
      .post('/clashes/bulk')
      .set(authHeaders(COORDINATOR, PROJECT_A.id))
      .send({ ids: [CLASH_A_ID, CLASH_B_ID], patch: { statusId: 'st-inprogress' } })
      .expect(404);

    // Nothing should have been mutated — the batch is all-or-nothing.
    expect(clashes.find((c) => c.id === CLASH_A_ID)?.statusId).toBe('st-open');
  });

  it('list only returns clashes belonging to the active project, ignoring a foreign projectId in the query string', async () => {
    const res = await request(app.getHttpServer())
      .get('/clashes')
      .query({ page: 1, pageSize: 10, projectId: PROJECT_B.id })
      .set(authHeaders(ENGINEER_A, PROJECT_A.id))
      .expect(200);

    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([CLASH_A_ID]);
  });

  it('master-data disciplines are scoped to the active project', async () => {
    const resA = await request(app.getHttpServer())
      .get('/master-data/disciplines')
      .set(authHeaders(ENGINEER_A, PROJECT_A.id))
      .expect(200);
    expect(resA.body.map((d: { id: string }) => d.id)).toEqual(['disc-a']);

    const resB = await request(app.getHttpServer())
      .get('/master-data/disciplines')
      .set(authHeaders(ENGINEER_B, PROJECT_B.id))
      .expect(200);
    expect(resB.body.map((d: { id: string }) => d.id)).toEqual(['disc-b']);
  });

  it('lets Coordinator/Admin/Management reach a project they hold no ProjectMember row in', async () => {
    await request(app.getHttpServer())
      .get(`/clashes/${CLASH_B_ID}`)
      .set(authHeaders(COORDINATOR, PROJECT_B.id))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/clashes/${CLASH_A_ID}`)
      .set(authHeaders(ADMIN, PROJECT_A.id))
      .expect(200);
  });

  it('rejects an unknown X-Project-Id (project does not exist)', async () => {
    await request(app.getHttpServer())
      .get('/clashes')
      .set(authHeaders(ENGINEER_A, 'proj-does-not-exist'))
      .expect(404);
  });
});
