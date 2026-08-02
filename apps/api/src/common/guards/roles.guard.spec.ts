import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { AuthUser } from '../../auth/auth.types';

function contextWith(user?: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: Role[] | undefined) {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const admin: AuthUser = { id: 'u-admin', email: 'admin@clashhub.dev', role: Role.ADMIN };
const engineer: AuthUser = { id: 'u-eng', email: 'engineer@clashhub.dev', role: Role.ENGINEER };

describe('RolesGuard', () => {
  it('allows a route with no @Roles() through for any authenticated user', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(engineer))).toBe(true);
    expect(guardRequiring([]).canActivate(contextWith(engineer))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    expect(guardRequiring([Role.ADMIN]).canActivate(contextWith(admin))).toBe(true);
  });

  it('allows any of several listed roles', () => {
    const guard = guardRequiring([Role.ADMIN, Role.COORDINATOR]);
    const coordinator: AuthUser = { id: 'u-coord', email: 'c@x.dev', role: Role.COORDINATOR };
    expect(guard.canActivate(contextWith(coordinator))).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    expect(() => guardRequiring([Role.ADMIN]).canActivate(contextWith(engineer))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects Management on write routes reserved for Coordinator/Admin', () => {
    const management: AuthUser = { id: 'u-mgmt', email: 'm@x.dev', role: Role.MANAGEMENT };
    const guard = guardRequiring([Role.ADMIN, Role.COORDINATOR]);
    expect(() => guard.canActivate(contextWith(management))).toThrow(ForbiddenException);
  });

  it('rejects when there is no user on the request', () => {
    expect(() => guardRequiring([Role.ADMIN]).canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
