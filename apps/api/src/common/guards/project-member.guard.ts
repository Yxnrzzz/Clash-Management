import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';

/**
 * Ensures the caller belongs to the project named by `:projectId` (route param,
 * body, or query). Admins bypass the check — they administer every project.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();

    const user = request.user;
    if (!user) throw new ForbiddenException('Tidak ada konteks pengguna.');
    if (user.role === Role.ADMIN) return true;

    const projectId =
      request.params?.projectId ??
      (typeof request.body?.projectId === 'string' ? request.body.projectId : undefined) ??
      (typeof request.query?.projectId === 'string' ? request.query.projectId : undefined);

    // Nothing to scope against — leave the decision to the route's own guards.
    if (!projectId) return true;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });

    if (!membership) {
      throw new ForbiddenException('Anda bukan anggota proyek ini.');
    }

    return true;
  }
}
