import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(existingCodes: string[] = []) {
  const project = {
    findUnique: jest.fn(({ where: { code } }: { where: { code: string } }) =>
      Promise.resolve(existingCodes.includes(code) ? { id: 'existing', code } : null),
    ),
    create: jest.fn(({ data }: { data: { name: string; code: string } }) =>
      Promise.resolve({ id: 'proj-new', ...data }),
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

describe('ProjectsService.create', () => {
  it('creates a project with the code trimmed and uppercased', async () => {
    const { prisma, project } = makePrisma();
    const service = new ProjectsService(prisma);

    const created = await service.create({ name: '  Menara Baru  ', code: ' bar ' });

    expect(project.create).toHaveBeenCalledWith({
      data: { name: 'Menara Baru', code: 'BAR' },
    });
    expect(created).toEqual({ id: 'proj-new', name: 'Menara Baru', code: 'BAR' });
  });

  it('rejects a code that is already taken, case-insensitively via normalization', async () => {
    const { prisma, project } = makePrisma(['BAR']);
    const service = new ProjectsService(prisma);

    await expect(service.create({ name: 'Menara Baru', code: 'bar' })).rejects.toThrow(
      ConflictException,
    );
    expect(project.create).not.toHaveBeenCalled();
  });
});

describe('ProjectsService membership', () => {
  const ALICE: FakeUser = { id: 'u-alice', name: 'Alice', email: 'alice@eps.dev' };
  const BOB: FakeUser = { id: 'u-bob', name: 'Bob', email: 'bob@eps.dev' };

  describe('listMembers', () => {
    it('throws NotFoundException for an unknown project', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [] });
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

      await expect(
        service.addMember('proj-ghost', { userId: ALICE.id, projectRole: 'Engineer' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for an unknown user', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [{ id: 'proj-1' }], users: [] });
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

      await expect(service.removeMember('proj-ghost', ALICE.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the membership does not exist', async () => {
      const { prisma } = makeMembershipPrisma({ projects: [{ id: 'proj-1' }], users: [ALICE] });
      const service = new ProjectsService(prisma);

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
      const service = new ProjectsService(prisma);

      const result = await service.removeMember('proj-1', ALICE.id);

      expect(projectMember.delete).toHaveBeenCalledWith({
        where: { projectId_userId: { projectId: 'proj-1', userId: ALICE.id } },
      });
      expect(result).toEqual([expect.objectContaining({ userId: BOB.id })]);
    });
  });
});
