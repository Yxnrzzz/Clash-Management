import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../../auth/auth.types';

/**
 * Reads the roles listed by @Roles() on the handler (falling back to the
 * controller) and checks them against the role carried in the access token.
 * Routes without @Roles() are open to any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new ForbiddenException('Tidak ada konteks pengguna.');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Peran ${user.role} tidak diizinkan mengakses sumber daya ini.`);
    }

    return true;
  }
}
