import { ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CanActivate } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { SKIP_PROJECT_SCOPE_KEY } from '../decorators/skip-project-scope.decorator';
import { CROSS_PROJECT_ROLES } from '../constants/project-roles';

/**
 * Registered globally (after JwtAuthGuard/RolesGuard). Resolves the active
 * project from the X-Project-Id header and verifies the caller may use it,
 * so every service downstream can trust `request.activeProjectId` instead of
 * guessing "the" project. Unlike the ProjectMemberGuard it replaces, this
 * guard is deny-by-default: routes must opt out via @SkipProjectScope()
 * instead of silently passing when no project id is present.
 */
@Injectable()
export class ProjectContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PROJECT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; headers: Record<string, string | string[] | undefined>; activeProjectId?: string }>();

    // No authenticated user means the route is @Public() (auth already
    // skipped by JwtAuthGuard) — nothing for this guard to scope.
    const user = request.user;
    if (!user) return true;

    const header = request.headers['x-project-id'];
    const projectId = Array.isArray(header) ? header[0] : header;

    if (!projectId) {
      throw new ForbiddenException('Header X-Project-Id wajib disertakan.');
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan.');
    }

    // Guard-level, not resource-level: the client asserted this exact
    // X-Project-Id and the answer is "that project can no longer be used" —
    // the same class of rejection as "you are not a member" below, hence
    // 403 rather than 404. ProjectsController stays @SkipProjectScope()
    // (class-level) so Admin can still PATCH/unarchive/delete an archived
    // project through it.
    if (project.archivedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROJECT_ARCHIVED',
        message: 'Proyek ini sudah diarsipkan.',
      });
    }

    if (!CROSS_PROJECT_ROLES.includes(user.role)) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (!membership) {
        throw new ForbiddenException('Anda bukan anggota proyek ini.');
      }
    }

    request.activeProjectId = projectId;
    return true;
  }
}
