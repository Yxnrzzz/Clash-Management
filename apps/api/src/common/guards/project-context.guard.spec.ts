import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ProjectContextGuard } from './project-context.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';

const PROJECT = { id: 'proj-1' };

function contextWith(user: AuthUser | undefined, headerProjectId: string | undefined, skip: boolean) {
  const request: { user?: AuthUser; headers: Record<string, string>; activeProjectId?: string } = {
    user,
    headers: headerProjectId ? { 'x-project-id': headerProjectId } : {},
  };
  const reflector = { getAllAndOverride: () => skip } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, request, reflector };
}

function makeGuard(reflector: Reflector, membership: { projectId: string; userId: string } | null) {
  const prisma = {
    project: { findUnique: jest.fn(() => Promise.resolve(PROJECT)) },
    projectMember: { findUnique: jest.fn(() => Promise.resolve(membership)) },
  } as unknown as PrismaService;
  return new ProjectContextGuard(prisma, reflector);
}

const engineer: AuthUser = { id: 'u-eng', email: 'e@x.dev', role: Role.ENGINEER };
const coordinator: AuthUser = { id: 'u-coord', email: 'c@x.dev', role: Role.COORDINATOR };
const admin: AuthUser = { id: 'u-admin', email: 'a@x.dev', role: Role.ADMIN };

describe('ProjectContextGuard', () => {
  it('skips entirely for @SkipProjectScope() routes', async () => {
    const { context, reflector } = contextWith(engineer, undefined, true);
    const guard = makeGuard(reflector, null);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('skips when there is no authenticated user (a @Public() route)', async () => {
    const { context, reflector } = contextWith(undefined, undefined, false);
    const guard = makeGuard(reflector, null);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects when X-Project-Id is missing entirely', async () => {
    const { context, reflector } = contextWith(engineer, undefined, false);
    const guard = makeGuard(reflector, null);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rejects an unknown project id', async () => {
    const { context, reflector } = contextWith(engineer, 'proj-1', false);
    const prisma = {
      project: { findUnique: jest.fn(() => Promise.resolve(null)) },
      projectMember: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const guard = new ProjectContextGuard(prisma, reflector);
    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('rejects an Engineer who is not a member of the requested project', async () => {
    const { context, reflector } = contextWith(engineer, 'proj-1', false);
    const guard = makeGuard(reflector, null);
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('allows an Engineer who is a member and attaches activeProjectId', async () => {
    const { context, request, reflector } = contextWith(engineer, 'proj-1', false);
    const guard = makeGuard(reflector, { projectId: 'proj-1', userId: engineer.id });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.activeProjectId).toBe('proj-1');
  });

  it.each([coordinator, admin])(
    'lets %s through without a ProjectMember row (cross-project role)',
    async (user) => {
      const { context, reflector } = contextWith(user, 'proj-1', false);
      const guard = makeGuard(reflector, null);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
});
