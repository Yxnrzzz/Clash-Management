import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  private async currentProjectId(): Promise<string> {
    const project = await this.prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!project) throw new NotFoundException('Belum ada proyek.');
    return project.id;
  }

  // --- Disciplines ---------------------------------------------------------

  async listDisciplines() {
    return this.prisma.discipline.findMany({ orderBy: { code: 'asc' } });
  }

  async createDiscipline(dto: CreateDisciplineDto) {
    const projectId = await this.currentProjectId();
    const code = dto.code.trim().toUpperCase();

    const clash = await this.prisma.discipline.findUnique({
      where: { projectId_code: { projectId, code } },
    });
    if (clash) throw new ConflictException('Kode disiplin sudah dipakai');

    return this.prisma.discipline.create({
      data: { projectId, code, name: dto.name.trim() },
    });
  }

  async updateDiscipline(id: string, dto: UpdateDisciplineDto) {
    const existing = await this.prisma.discipline.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Disiplin tidak ditemukan.');

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const clash = await this.prisma.discipline.findUnique({
        where: { projectId_code: { projectId: existing.projectId, code } },
      });
      if (clash && clash.id !== id) throw new ConflictException('Kode disiplin sudah dipakai');
    }

    return this.prisma.discipline.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      },
    });
  }

  async setDisciplineActive(id: string, isActive: boolean) {
    await this.assertExists('discipline', id, 'Disiplin tidak ditemukan.');
    return this.prisma.discipline.update({ where: { id }, data: { isActive } });
  }

  // --- Zones ---------------------------------------------------------------

  async listZones() {
    return this.prisma.zone.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] });
  }

  async createZone(dto: CreateZoneDto) {
    const projectId = await this.currentProjectId();
    return this.prisma.zone.create({
      data: { projectId, name: dto.name.trim(), level: dto.level.trim() },
    });
  }

  async updateZone(id: string, dto: UpdateZoneDto) {
    await this.assertExists('zone', id, 'Zona tidak ditemukan.');
    return this.prisma.zone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.level !== undefined ? { level: dto.level.trim() } : {}),
      },
    });
  }

  async setZoneActive(id: string, isActive: boolean) {
    await this.assertExists('zone', id, 'Zona tidak ditemukan.');
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

  private async assertExists(
    model: 'discipline' | 'zone' | 'priority',
    id: string,
    message: string,
  ) {
    const found =
      model === 'discipline'
        ? await this.prisma.discipline.findUnique({ where: { id } })
        : model === 'zone'
          ? await this.prisma.zone.findUnique({ where: { id } })
          : await this.prisma.priority.findUnique({ where: { id } });

    if (!found) throw new NotFoundException(message);
  }
}
