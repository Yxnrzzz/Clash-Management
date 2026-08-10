import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { CODE_RENAME_AUDIT_CHUNK_SIZE, formatClashCode } from '../clashes/clash-code';
import {
  CopyTemplateDto,
  CreateDisciplineDto,
  CreatePriorityDto,
  CreateZoneDto,
  UpdateDisciplineDto,
  UpdatePriorityDto,
  UpdateStatusDto,
  UpdateZoneDto,
} from './dto/master-data.dto';

/**
 * Disciplines, zones and priorities are soft-deleted via `isActive` rather than
 * removed, so historical clashes referencing them never become orphans. The
 * frontend mirrors this: new-clash forms list only active entries, while the
 * Register's filter chips still show inactive ones labelled "(nonaktif)".
 */
@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Disciplines ---------------------------------------------------------

  async listDisciplines(projectId: string) {
    return this.prisma.discipline.findMany({ where: { projectId }, orderBy: { code: 'asc' } });
  }

  async createDiscipline(dto: CreateDisciplineDto, projectId: string) {
    const code = dto.code.trim().toUpperCase();

    const clash = await this.prisma.discipline.findUnique({
      where: { projectId_code: { projectId, code } },
    });
    if (clash) throw new ConflictException('Kode disiplin sudah dipakai');

    return this.prisma.discipline.create({
      data: { projectId, code, name: dto.name.trim() },
    });
  }

  /**
   * A name-only update is a plain field write. A code change is treated as
   * a rename: same shape as ProjectsService.update — it rewrites every
   * clash's uniqueCode in this discipline (including soft-deleted ones) so
   * uniqueCode stays `${project.code}-${code}-${seq}` for every row.
   */
  async updateDiscipline(id: string, dto: UpdateDisciplineDto, projectId: string, actor: AuthUser) {
    const existing = await this.prisma.discipline.findUnique({ where: { id } });
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Disiplin tidak ditemukan.');
    }

    const nextName = dto.name !== undefined ? dto.name.trim() : undefined;
    const nextCode = dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined;
    const codeChanged = nextCode !== undefined && nextCode !== existing.code;

    if (codeChanged) {
      const clash = await this.prisma.discipline.findUnique({
        where: { projectId_code: { projectId: existing.projectId, code: nextCode } },
      });
      if (clash && clash.id !== id) throw new ConflictException('Kode disiplin sudah dipakai');
    }

    if (!codeChanged) {
      return this.prisma.discipline.update({
        where: { id },
        data: { ...(nextName !== undefined ? { name: nextName } : {}) },
      });
    }

    await this.rewriteDisciplineClashCodes(id, existing.projectId, nextCode, actor.id);

    return this.prisma.discipline.update({
      where: { id },
      data: { code: nextCode, ...(nextName !== undefined ? { name: nextName } : {}) },
    });
  }

  /**
   * Same set-based-UPDATE-is-safe reasoning as
   * ProjectsService.rewriteProjectClashCodes: every affected row moves from
   * the old discipline-code segment to the new one, OLD != new is already
   * guaranteed by the caller, so the batch's before/after code sets are
   * disjoint and a single statement can't collide with itself. The only
   * real risk is a live clash in a DIFFERENT discipline already occupying
   * one of the new codes — checked up front and again via the partial
   * unique index as a backstop.
   */
  private async rewriteDisciplineClashCodes(
    disciplineId: string,
    projectId: string,
    newDisciplineCode: string,
    actorId: string,
  ): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });

        const affected = await tx.clash.findMany({
          where: { disciplineId },
          select: { id: true, uniqueCode: true, seq: true },
        });
        if (affected.length === 0) return 0;

        const newCodeById = new Map(
          affected.map((c) => [c.id, formatClashCode(project.code, newDisciplineCode, c.seq)]),
        );
        const newCodes = [...newCodeById.values()];

        const collisions = await tx.clash.findMany({
          where: { disciplineId: { not: disciplineId }, deletedAt: null, uniqueCode: { in: newCodes } },
          select: { uniqueCode: true },
          take: 20,
        });
        if (collisions.length > 0) {
          throw new ConflictException(
            `Tidak bisa mengubah kode disiplin: ${collisions.length} kode clash baru akan bentrok (mis. "${collisions[0].uniqueCode}").`,
          );
        }

        try {
          await tx.$executeRaw`
            UPDATE "Clash"
               SET "uniqueCode" = ${project.code} || '-' || ${newDisciplineCode} || '-' || lpad("seq"::text, 4, '0')
             WHERE "disciplineId" = ${disciplineId}`;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('Tidak bisa mengubah kode disiplin: bentrok dengan clash lain.');
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

  async setDisciplineActive(id: string, isActive: boolean, projectId: string) {
    await this.assertExists('discipline', id, 'Disiplin tidak ditemukan.', projectId);
    return this.prisma.discipline.update({ where: { id }, data: { isActive } });
  }

  // --- Zones ---------------------------------------------------------------

  async listZones(projectId: string) {
    return this.prisma.zone.findMany({
      where: { projectId },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  async createZone(dto: CreateZoneDto, projectId: string) {
    return this.prisma.zone.create({
      data: { projectId, name: dto.name.trim(), level: dto.level.trim() },
    });
  }

  async updateZone(id: string, dto: UpdateZoneDto, projectId: string) {
    await this.assertExists('zone', id, 'Zona tidak ditemukan.', projectId);
    return this.prisma.zone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.level !== undefined ? { level: dto.level.trim() } : {}),
      },
    });
  }

  async setZoneActive(id: string, isActive: boolean, projectId: string) {
    await this.assertExists('zone', id, 'Zona tidak ditemukan.', projectId);
    return this.prisma.zone.update({ where: { id }, data: { isActive } });
  }

  // --- Priorities ----------------------------------------------------------

  async listPriorities() {
    return this.prisma.priority.findMany({ orderBy: { weight: 'asc' } });
  }

  async createPriority(dto: CreatePriorityDto) {
    return this.prisma.priority.create({ data: { name: dto.name.trim(), weight: dto.weight } });
  }

  async updatePriority(id: string, dto: UpdatePriorityDto) {
    await this.assertExists('priority', id, 'Prioritas tidak ditemukan.');
    return this.prisma.priority.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
      },
    });
  }

  async setPriorityActive(id: string, isActive: boolean) {
    await this.assertExists('priority', id, 'Prioritas tidak ditemukan.');
    return this.prisma.priority.update({ where: { id }, data: { isActive } });
  }

  // --- Statuses ------------------------------------------------------------

  async listStatuses() {
    return this.prisma.status.findMany({ orderBy: { sequence: 'asc' } });
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const existing = await this.prisma.status.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Status tidak ditemukan.');

    // At least one closed state must survive, otherwise nothing can ever close
    // and the Dashboard's closed-rate KPI is undefined.
    if (dto.isClosedState === false && existing.isClosedState) {
      const otherClosed = await this.prisma.status.count({
        where: { isClosedState: true, id: { not: id } },
      });
      if (otherClosed === 0) {
        throw new BadRequestException('Minimal satu status harus berupa status penutup.');
      }
    }

    return this.prisma.status.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isClosedState !== undefined ? { isClosedState: dto.isClosedState } : {}),
      },
    });
  }

  // --- Templates -------------------------------------------------------------

  /**
   * Copies active disciplines/zones from one project to another. Idempotent
   * by design (safe to run twice): rows that already exist in the target —
   * matched by code for disciplines, by name+level for zones — are skipped
   * rather than duplicated. Priorities/statuses are project-agnostic already
   * (no projectId column) so they never need copying.
   */
  async copyTemplate(dto: CopyTemplateDto) {
    if (dto.fromProjectId === dto.toProjectId) {
      throw new BadRequestException('Proyek sumber dan tujuan harus berbeda.');
    }

    const [fromProject, toProject] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: dto.fromProjectId } }),
      this.prisma.project.findUnique({ where: { id: dto.toProjectId } }),
    ]);
    if (!fromProject) throw new NotFoundException('Proyek sumber tidak ditemukan.');
    if (!toProject) throw new NotFoundException('Proyek tujuan tidak ditemukan.');
    // fromProjectId/toProjectId come from the body, not X-Project-Id, so
    // ProjectContextGuard's archived check never sees them — this route is
    // @SkipProjectScope() by design (cross-project). Check the target
    // explicitly; copying INTO an archived project would be silently
    // invisible until it's unarchived.
    if (toProject.archivedAt) {
      throw new ForbiddenException('Proyek tujuan sudah diarsipkan.');
    }

    const copied = { disciplines: 0, zones: 0 };
    const skipped = { disciplines: 0, zones: 0 };

    if (dto.include.includes('disciplines')) {
      const [sourceRows, targetRows] = await Promise.all([
        this.prisma.discipline.findMany({ where: { projectId: fromProject.id, isActive: true } }),
        this.prisma.discipline.findMany({ where: { projectId: toProject.id } }),
      ]);
      const existingCodes = new Set(targetRows.map((d) => d.code.toUpperCase()));

      for (const row of sourceRows) {
        if (existingCodes.has(row.code.toUpperCase())) {
          skipped.disciplines++;
          continue;
        }
        await this.prisma.discipline.create({
          data: { projectId: toProject.id, code: row.code, name: row.name },
        });
        existingCodes.add(row.code.toUpperCase());
        copied.disciplines++;
      }
    }

    if (dto.include.includes('zones')) {
      const [sourceRows, targetRows] = await Promise.all([
        this.prisma.zone.findMany({ where: { projectId: fromProject.id, isActive: true } }),
        this.prisma.zone.findMany({ where: { projectId: toProject.id } }),
      ]);
      const zoneKey = (name: string, level: string) => `${level.toLowerCase()}::${name.toLowerCase()}`;
      const existingKeys = new Set(targetRows.map((z) => zoneKey(z.name, z.level)));

      for (const row of sourceRows) {
        const key = zoneKey(row.name, row.level);
        if (existingKeys.has(key)) {
          skipped.zones++;
          continue;
        }
        await this.prisma.zone.create({
          data: { projectId: toProject.id, name: row.name, level: row.level },
        });
        existingKeys.add(key);
        copied.zones++;
      }
    }

    return { copied, skipped };
  }

  /**
   * `projectId` is only meaningful for discipline/zone (priority has no
   * projectId column — it's global). When passed, a row that exists but
   * belongs to a different project is reported as NotFound, matching
   * ClashesService's assertClashInProject: don't leak that the id exists
   * elsewhere.
   */
  private async assertExists(
    model: 'discipline' | 'zone' | 'priority',
    id: string,
    message: string,
    projectId?: string,
  ) {
    const found =
      model === 'discipline'
        ? await this.prisma.discipline.findUnique({ where: { id } })
        : model === 'zone'
          ? await this.prisma.zone.findUnique({ where: { id } })
          : await this.prisma.priority.findUnique({ where: { id } });

    if (!found || (projectId !== undefined && (found as { projectId?: string }).projectId !== projectId)) {
      throw new NotFoundException(message);
    }
    return found as { id: string; projectId: string };
  }
}
