import { CanActivate, ExecutionContext, INestApplication, Injectable, Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { ProjectsModule } from '../projects/projects.module';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectContextGuard } from '../common/guards/project-context.guard';

/**
 * Covers the one Admin-only RBAC surface that, per HANDOFF.md §12, had been
 * verified only by hand in the browser and never by an automated test: the
 * project membership endpoints (GET/POST/DELETE /projects/:projectId/members).
 * Same style as project-isolation.e2e-spec.ts — real HTTP through Nest's
 * router/guards/DTO validation, Prisma faked in memory so no Postgres/Redis
 * is needed.
 */

const PROJECT_A = { id: 'proj-a' };
const ALICE = { id: 'u-alice', name: 'Alice', email: 'alice@eps.dev' };
const BOB = { id: 'u-bob', name: 'Bob', email: 'bob@eps.dev' };

const ENGINEER = { id: 'u-eng', role: Role.ENGINEER };
const COORDINATOR = { id: 'u-coord', role: Role.COORDINATOR };
const ADMIN = { id: 'u-admin', role: Role.ADMIN };

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-test-user-id'];
    const role = req.headers['x-test-user-role'];
    if (userId && role) {
      req.user = { id: userId, email: `${userId}@test.local`, role };
    }
    return true;
  }
}

function authHeaders(user: { id: string; role: Role }) {
  return { 'x-test-user-id': user.id, 'x-test-user-role': user.role };
}

@Module({
  imports: [ProjectsModule],
  providers: [
    { provide: APP_GUARD, useClass: TestAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ProjectContextGuard },
  ],
})
class TestAppModule {}

describe('Project membership endpoints (RBAC + validation)', () => {
  let app: INestApplication;
  let memberships: { projectId: string; userId: string; projectRole: string; joinedAt: Date }[];

  beforeEach(async () => {
    memberships = [];

    const fakePrisma = {
      project: {
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(id === PROJECT_A.id ? PROJECT_A : null),
        ),
      },
      user: {
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve([ALICE, BOB].find((u) => u.id === id) ?? null),
        ),
      },
      projectMember: {
        findMany: jest.fn(({ where: { projectId } }: { where: { projectId: string } }) =>
          Promise.resolve(
            memberships
              .filter((m) => m.projectId === projectId)
              .map((m) => ({ ...m, user: [ALICE, BOB].find((u) => u.id === m.userId)! })),
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
                  m.projectId === projectId_userId.projectId &&
                  m.userId === projectId_userId.userId,
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
                m.projectId === projectId_userId.projectId &&
                m.userId === projectId_userId.userId,
            );
            const [removed] = memberships.splice(idx, 1);
            return Promise.resolve(removed);
          },
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('RBAC', () => {
    it('Admin reaches the membership routes with no X-Project-Id header (proves @SkipProjectScope on the controller)', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ADMIN))
        .expect(200);
    });

    it('rejects Coordinator with 403 (only ADMIN is allowed, despite Coordinator being a cross-project role elsewhere)', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(COORDINATOR))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(COORDINATOR))
        .send({ userId: ALICE.id, projectRole: 'Engineer' })
        .expect(403);
    });

    it('rejects Engineer with 403 on all three routes', async () => {
      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ENGINEER))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ENGINEER))
        .send({ userId: ALICE.id, projectRole: 'Engineer' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_A.id}/members/${ALICE.id}`)
        .set(authHeaders(ENGINEER))
        .expect(403);
    });
  });

  describe('validation and behavior as Admin', () => {
    it('400s on a malformed body (missing projectRole)', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ADMIN))
        .send({ userId: ALICE.id })
        .expect(400);
    });

    it('404s adding a member to an unknown project', async () => {
      await request(app.getHttpServer())
        .post('/projects/proj-ghost/members')
        .set(authHeaders(ADMIN))
        .send({ userId: ALICE.id, projectRole: 'Engineer' })
        .expect(404);
    });

    it('adds then removes a member end-to-end, list reflecting each step', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ADMIN))
        .send({ userId: ALICE.id, projectRole: 'Engineer' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual([expect.objectContaining({ userId: ALICE.id })]);
        });

      await request(app.getHttpServer())
        .get(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ADMIN))
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([expect.objectContaining({ userId: ALICE.id })]);
        });

      await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_A.id}/members/${ALICE.id}`)
        .set(authHeaders(ADMIN))
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('409s adding a user who is already a member', async () => {
      memberships.push({
        projectId: PROJECT_A.id,
        userId: ALICE.id,
        projectRole: 'Engineer',
        joinedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post(`/projects/${PROJECT_A.id}/members`)
        .set(authHeaders(ADMIN))
        .send({ userId: ALICE.id, projectRole: 'Coordinator' })
        .expect(409);
    });

    it('404s removing a membership that does not exist', async () => {
      await request(app.getHttpServer())
        .delete(`/projects/${PROJECT_A.id}/members/${BOB.id}`)
        .set(authHeaders(ADMIN))
        .expect(404);
    });
  });
});
