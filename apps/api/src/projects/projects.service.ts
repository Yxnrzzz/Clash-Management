import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';
import { CROSS_PROJECT_ROLES } from '../common/constants/project-roles';
import { CODE_RENAME_AUDIT_CHUNK_SIZE, formatClashCode } from '../clashes/clash-code';
import { AddProjectMemberDto, CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Fallback "default active project" for the frontend to pre-select before
   * the user picks one explicitly via the switcher. Cross-project roles get
   * the oldest project overall; Engineers get the oldest project they're
   * actually a member of. Archived projects are excluded — they behave as
   * if they don't exist for this purpose.
   */
  async findCurrent(user: AuthUser) {
    const project = CROSS_PROJECT_ROLES.includes(user.role)
      ? await this.prisma.project.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } })
      : (
          await this.prisma.projectMember.findFirst({
            where: { userId: user.id, project: { archivedAt: null } },
            orderBy: { joinedAt: 'asc' },
            include: { project: true },
          })
        )?.project;

    if (!project) throw new NotFoundException('Belum ada proyek untuk pengguna ini.');
    return { id: project.id, name: project.name, code: project.code, archivedAt: project.archivedAt };
  }

  /**
   * Every signed-in user gets the projects list, filtered to their own
   * memberships unless their role administers every project. Archived
   * projects are excluded by default; `includeArchived` (Admin only, same
   * '1'/'true' query convention as ListClashesQueryDto's `deleted`) shows
   * them too, so the archive panel has something to list and unarchive.
   */
  async listAll(user: AuthUser, query?: ListProjectsQueryDto) {
    if (query?.includeArchived && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Hanya Admin yang dapat melihat proyek yang diarsipkan.');
    }
    const archivedFilter: Prisma.ProjectWhereInput =
      query?.includeArchived && user.role === Role.ADMIN ? {} : { archivedAt: null };

    const projects = CROSS_PROJECT_ROLES.includes(user.role)
      ? await this.prisma.project.findMany({ where: archivedFilter, orderBy: { name: 'asc' } })
      : (
          await this.prisma.projectMember.findMany({
            where: { userId: user.id, project: archivedFilter },
            include: { project: true },
            orderBy: { project: { name: 'asc' } },
          })
        ).map((m) => m.project);

    return projects.map((p) => ({ id: p.id, name: p.name, code: p.code, archivedAt: p.archivedAt }));
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
    return { id: project.id, name: project.name, code: project.code, archivedAt: project.archivedAt };
  }

  /**
   * A name-only update is a plain field write. A code change is treated as
   * a rename: it rewrites every clash's uniqueCode in this project
   * (including soft-deleted ones, so a later restore still lines up — see
   * ClashesService.restore) to keep uniqueCode == `${code}-${discipline}-
   * ${seq}` for every row. See rewriteProjectClashCodes for how that stays
   * safe under the partial-unique-index constraint.
   */
  async update(id: string, dto: UpdateProjectDto, actor: AuthUser) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Proyek tidak ditemukan.');

    const nextName = dto.name !== undefined ? dto.name.trim() : undefined;
    const nextCode = dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined;
    const codeChanged = nextCode !== undefined && nextCode !== existing.code;

    if (codeChanged) {
      const clash = await this.prisma.project.findUnique({ where: { code: nextCode } });
      if (clash) throw new ConflictException(`Kode proyek "${nextCode}" sudah dipakai.`);
    }

    if (!codeChanged) {
      const project = await this.prisma.project.update({
        where: { id },
        data: { ...(nextName !== undefined ? { name: nextName } : {}) },
      });
      return {
        id: project.id,
        name: project.name,
        code: project.code,
        archivedAt: project.archivedAt,
        rewrittenClashCount: 0,
      };
    }

    const rewrittenClashCount = await this.rewriteProjectClashCodes(id, nextCode, actor.id);

    const project = await this.prisma.project.update({
      where: { id },
      data: { ...(nextName !== undefined ? { name: nextName } : {}), code: nextCode },
    });
    return {
      id: project.id,
      name: project.name,
      code: project.code,
      archivedAt: project.archivedAt,
      rewrittenClashCount,
    };
  }

  /**
   * Rewrites uniqueCode for every clash in `projectId` to use
   * `newProjectCode` as its prefix, in one set-based UPDATE. Safe as a
   * single statement (no temp-prefix two-phase dance needed) because every
   * row moves from the OLD prefix to the NEW one and OLD != NEW is already
   * guaranteed by the caller — the before/after code sets for this
   * statement are disjoint, so no row in the batch can collide with another
   * row in the same batch. The only real collision risk is with a live
   * clash in a DIFFERENT project that already happens to occupy one of the
   * new codes — checked up front and again via the partial unique index
   * (Clash_uniqueCode_live_key) as a backstop against a concurrent insert
   * slipping in between the check and the update.
   */
  private async rewriteProjectClashCodes(
    projectId: string,
    newProjectCode: string,
    actorId: string,
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const affected = await tx.clash.findMany({
          where: { projectId },
          select: { id: true, uniqueCode: true, seq: true, discipline: { select: { code: true } } },
        });
        if (affected.length === 0) return 0;

        const newCodeById = new Map(
          affected.map((c) => [c.id, formatClashCode(newProjectCode, c.discipline.code, c.seq)]),
        );
        const newCodes = [...newCodeById.values()];

        const collisions = await tx.clash.findMany({
          where: { projectId: { not: projectId }, deletedAt: null, uniqueCode: { in: newCodes } },
          select: { uniqueCode: true },
          take: 20,
        });
        if (collisions.length > 0) {
          throw new ConflictException(
            `Tidak bisa mengubah kode proyek: ${collisions.length} kode clash baru akan bentrok dengan proyek lain (mis. "${collisions[0].uniqueCode}").`,
          );
        }

        try {
          await tx.$executeRaw`
            UPDATE "Clash" c
               SET "uniqueCode" = ${newProjectCode} || '-' || d."code" || '-' || lpad(c."seq"::text, 4, '0')
              FROM "Discipline" d
             WHERE d."id" = c."disciplineId" AND c."projectId" = ${projectId}`;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Tidak bisa mengubah kode proyek: bentrok dengan clash proyek lain.');
          }
          throw error;
        }

        const nowIso = new Date();
        for (let i = 0; i < affected.length; i += CODE_RENAME_AUDIT_CHUNK_SIZE) {
          await tx.auditLog.createMany({
            data: affected.slice(i, i + CODE_RENAME_AUDIT_CHUNK_SIZE).map((c) => ({
              clashId: c.id,
              actorId,
              action: 'code_changed',
              field: 'uniqueCode',
              oldValue: c.uniqueCode,
              newValue: newCodeById.get(c.id)!,
              createdAt: nowIso,
            })),
          });
        }

        return affected.length;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  /** Reversible hide: drops the project from the switcher, GET /projects,
   * and findCurrent; ProjectContextGuard rejects its X-Project-Id header
   * (403 PROJECT_ARCHIVED). Nothing else changes — clashes, members, and
   * master data are untouched and reappear exactly as they were on unarchive. */
  async archive(id: string) {
    await this.assertProjectExists(id);
    const project = await this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
    return { id: project.id, name: project.name, code: project.code, archivedAt: project.archivedAt };
  }

  async unarchive(id: string) {
    await this.assertProjectExists(id);
    const project = await this.prisma.project.update({ where: { id }, data: { archivedAt: null } });
    return { id: project.id, name: project.name, code: project.code, archivedAt: project.archivedAt };
  }

  /** Backs both the rename-confirmation dialog (how many clash codes will
   * be rewritten) and the delete button's enabled state (only a project
   * with zero clashes, including soft-deleted, can be hard-deleted). */
  async stats(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');

    const [totalClashCount, deletedClashCount] = await Promise.all([
      this.prisma.clash.count({ where: { projectId: id } }),
      this.prisma.clash.count({ where: { projectId: id, deletedAt: { not: null } } }),
    ]);
    return { id: project.id, totalClashCount, deletedClashCount, archivedAt: project.archivedAt };
  }

  /**
   * Hard delete — only permitted when the project has zero clashes,
   * including soft-deleted ones (they still hold the FK). Every Clash FK is
   * RESTRICT by deliberate design elsewhere in this schema, so this method
   * cascades explicitly instead of at the DB level: with the clash count
   * already proven zero, ProjectMember/Discipline/Zone/ImportJob is the
   * complete set of rows that reference this project (everything else hangs
   * off Clash). Import files are cleaned up from disk after the transaction
   * commits, fire-and-forget — same pattern as ClashesService's attachment
   * deletion.
   */
  async remove(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');

    const clashCount = await this.prisma.clash.count({ where: { projectId: id } });
    if (clashCount > 0) {
      throw new ConflictException(
        `Proyek masih punya ${clashCount} clash (termasuk yang terhapus). Arsipkan proyek ini alih-alih menghapusnya.`,
      );
    }

    let importJobs: { storageKey: string }[];
    try {
      importJobs = await this.prisma.$transaction(async (tx) => {
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        await tx.discipline.deleteMany({ where: { projectId: id } });
        await tx.zone.deleteMany({ where: { projectId: id } });
        const jobs = await tx.importJob.findMany({ where: { projectId: id }, select: { storageKey: true } });
        await tx.importJob.deleteMany({ where: { projectId: id } });
        await tx.project.delete({ where: { id } });
        return jobs;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Proyek tidak bisa dihapus: ada clash baru yang dibuat setelah pengecekan. Coba lagi.',
        );
      }
      throw error;
    }

    void Promise.all(importJobs.map((job) => this.storage.delete(job.storageKey))).catch((error) => {
      this.logger.warn(`Gagal menghapus file impor proyek ${id}: ${(error as Error).message}`);
    });

    return { id };
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
