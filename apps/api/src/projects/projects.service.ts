import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { CROSS_PROJECT_ROLES } from '../common/constants/project-roles';
import { AddProjectMemberDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fallback "default active project" for the frontend to pre-select before
   * the user picks one explicitly via the switcher. Cross-project roles get
   * the oldest project overall; Engineers get the oldest project they're
   * actually a member of.
   */
  async findCurrent(user: AuthUser) {
    const project = CROSS_PROJECT_ROLES.includes(user.role)
      ? await this.prisma.project.findFirst({ orderBy: { createdAt: 'asc' } })
      : (
          await this.prisma.projectMember.findFirst({
            where: { userId: user.id },
            orderBy: { joinedAt: 'asc' },
            include: { project: true },
          })
        )?.project;

    if (!project) throw new NotFoundException('Belum ada proyek untuk pengguna ini.');
    return { id: project.id, name: project.name, code: project.code };
  }

  /** Every signed-in user gets the projects list, filtered to their own
   * memberships unless their role administers every project. */
  async listAll(user: AuthUser) {
    const projects = CROSS_PROJECT_ROLES.includes(user.role)
      ? await this.prisma.project.findMany({ orderBy: { name: 'asc' } })
      : (
          await this.prisma.projectMember.findMany({
            where: { userId: user.id },
            include: { project: true },
            orderBy: { project: { name: 'asc' } },
          })
        ).map((m) => m.project);

    return projects.map((p) => ({ id: p.id, name: p.name, code: p.code }));
  }

  /**
   * Admin-only (enforced by @Roles on the route). The new project starts
   * with no disciplines/zones/members — Admin populates those afterward via
   * POST /master-data/templates/copy (copy from an existing project) and the
   * membership endpoints below. Priority/Status are global and need no setup.
   */
  async create(dto: CreateProjectDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.project.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Kode proyek "${code}" sudah dipakai.`);

    const project = await this.prisma.project.create({
      data: { name: dto.name.trim(), code },
    });
    return { id: project.id, name: project.name, code: project.code };
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proyek tidak ditemukan.');

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      },
    });
    return { id: project.id, name: project.name, code: project.code };
  }

  // --- Membership (Admin-only, see ProjectsController) ---------------------

  async listMembers(projectId: string) {
    await this.assertProjectExists(projectId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      projectRole: m.projectRole,
      joinedAt: m.joinedAt,
    }));
  }

  async addMember(projectId: string, dto: AddProjectMemberDto) {
    await this.assertProjectExists(projectId);

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('User sudah menjadi anggota proyek ini.');

    await this.prisma.projectMember.create({
      data: { projectId, userId: dto.userId, projectRole: dto.projectRole },
    });
    return this.listMembers(projectId);
  }

  async removeMember(projectId: string, userId: string) {
    await this.assertProjectExists(projectId);

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!existing) throw new NotFoundException('Keanggotaan tidak ditemukan.');

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    return this.listMembers(projectId);
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
  }
}
