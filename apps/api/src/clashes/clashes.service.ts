import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';
import {
  BulkUpdateClashDto,
  BulkUpdatePatchDto,
  CreateClashDto,
  CreateCommentDto,
  DashboardMetricsQueryDto,
  ListClashesQueryDto,
  UpdateClashDto,
} from './dto/clash.dto';

type PatchableField = 'statusId' | 'priorityId' | 'assigneeId' | 'dueDate';
type PatchValue = string | null | undefined;
type Patch = Partial<Record<PatchableField, PatchValue>>;

interface Slice {
  id: string;
  label: string;
  value: number;
}

interface TrendPoint {
  weekStart: string;
  createdCount: number;
  closedCount: number;
}

export interface DashboardMetrics {
  totalClash: number;
  openCount: number;
  closedCount: number;
  overdueCount: number;
  mttrDays: number | null;
  trend: TrendPoint[];
  byDiscipline: Slice[];
  byPriority: Slice[];
  byZone: Slice[];
}

/** Monday 00:00 of the week containing `date` — mirrors src/lib/dashboard-metrics.ts's startOfWeek(). */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Mirrors the RBAC rules the frontend already enforces for UX
 * (src/lib/lookup.ts canEditClash, src/lib/use-master-data.ts
 * allowedStatusTransitions) so a client that skips the UI cannot bypass them.
 */
@Injectable()
export class ClashesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async currentProject() {
    const project = await this.prisma.project.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!project) throw new NotFoundException('Belum ada proyek.');
    return project;
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * Filters/sorts/paginates server-side — see RegisterView.tsx's FiltersState
   * for the param shape this mirrors. pageSize can go up to 10000 (see the
   * DTO), which is what lets the Register's export buttons reuse this same
   * method (page=1&pageSize=10000) instead of a separate unpaginated route.
   */
  async list(query: ListClashesQueryDto) {
    const project = await this.currentProject();
    const where = this.buildListWhere(project.id, query);
    const orderBy = this.buildListOrderBy(query.sort, query.dir);

    const [data, total] = await Promise.all([
      this.prisma.clash.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.clash.count({ where }),
    ]);

    return { data, total };
  }

  private buildListWhere(projectId: string, query: ListClashesQueryDto): Prisma.ClashWhereInput {
    const where: Prisma.ClashWhereInput = { projectId };

    if (query.disc?.length) where.disciplineId = { in: query.disc };
    if (query.stat?.length) where.statusId = { in: query.stat };
    if (query.prio?.length) where.priorityId = { in: query.prio };
    if (query.zone?.length) where.zoneId = { in: query.zone };
    if (query.assignee?.length) where.assigneeId = { in: query.assignee };
    if (query.reporterId) where.reporterId = query.reporterId;

    if (query.cf || query.ct) {
      where.createdAt = {
        ...(query.cf ? { gte: new Date(query.cf) } : {}),
        ...(query.ct ? { lte: new Date(`${query.ct}T23:59:59.999Z`) } : {}),
      };
    }

    // Independent predicate from the status-chip filter above — a request
    // can combine "status = Open" with "overdue = true" just like the
    // Register's client-side filter used to.
    if (query.overdue) {
      where.status = { isClosedState: false };
      where.dueDate = { lt: new Date() };
    }

    if (query.q) {
      where.OR = [
        { uniqueCode: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildListOrderBy(
    sort: ListClashesQueryDto['sort'],
    dir: 'asc' | 'desc',
  ): Prisma.ClashOrderByWithRelationInput {
    switch (sort) {
      case 'kodeUnik':
        return { uniqueCode: dir };
      case 'judul':
        return { title: dir };
      case 'status':
        return { status: { sequence: dir } };
      case 'priority':
        return { priority: { weight: dir } };
      case 'dueDate':
        return { dueDate: dir };
      case 'createdAt':
      default:
        return { createdAt: dir };
    }
  }

  /**
   * Server-side port of computeMetrics() in src/lib/dashboard-metrics.ts —
   * same math (weekly trend buckets, MTTR, overdue count, zero-filled
   * slices), so the two must be kept in sync if the formula ever changes.
   * Trend points carry only `weekStart` (no formatted `label`); the frontend
   * mapper formats it with the existing Indonesian-locale formatter so
   * locale-specific presentation stays out of the API contract.
   */
  async metrics(query: DashboardMetricsQueryDto): Promise<DashboardMetrics> {
    const project = await this.currentProject();

    const [disciplines, zones, priorities, statuses] = await Promise.all([
      this.prisma.discipline.findMany({ where: { projectId: project.id } }),
      this.prisma.zone.findMany({ where: { projectId: project.id } }),
      this.prisma.priority.findMany(),
      this.prisma.status.findMany(),
    ]);

    // from/to are full ISO instants (Date#toISOString() on the frontend's
    // already-resolved range), not date-only strings — unlike list()'s
    // cf/ct, which come from plain <input type="date"> fields.
    const end = query.to ? new Date(query.to) : new Date();
    const start = query.from ? new Date(query.from) : null;

    const clashes = await this.prisma.clash.findMany({
      where: {
        projectId: project.id,
        createdAt: { ...(start ? { gte: start } : {}), lte: end },
      },
      select: {
        disciplineId: true,
        zoneId: true,
        priorityId: true,
        statusId: true,
        dueDate: true,
        createdAt: true,
        closedAt: true,
      },
    });

    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    const now = Date.now();

    let closedCount = 0;
    let overdueCount = 0;
    let resolutionMsTotal = 0;
    let resolvedForMttr = 0;

    for (const c of clashes) {
      const closed = statusMap.get(c.statusId)?.isClosedState ?? false;
      if (closed) closedCount++;
      const overdue = !closed && Boolean(c.dueDate) && c.dueDate!.getTime() < now;
      if (overdue) overdueCount++;
      if (closed && c.closedAt) {
        resolutionMsTotal += c.closedAt.getTime() - c.createdAt.getTime();
        resolvedForMttr++;
      }
    }

    const trend: TrendPoint[] = [];
    if (clashes.length > 0) {
      const timestamps = clashes.map((c) => c.createdAt.getTime());
      const firstWeek = startOfWeek(new Date(Math.min(...timestamps)));
      const lastWeek = startOfWeek(end);
      const buckets = new Map<string, TrendPoint>();

      for (let w = new Date(firstWeek); w <= lastWeek; w = addDays(w, 7)) {
        const key = w.toISOString().slice(0, 10);
        buckets.set(key, { weekStart: key, createdCount: 0, closedCount: 0 });
      }

      for (const c of clashes) {
        const createdBucket = buckets.get(startOfWeek(c.createdAt).toISOString().slice(0, 10));
        if (createdBucket) createdBucket.createdCount++;

        if (c.closedAt) {
          const closedBucket = buckets.get(startOfWeek(c.closedAt).toISOString().slice(0, 10));
          if (closedBucket) closedBucket.closedCount++;
        }
      }
      trend.push(...buckets.values());
    }

    return {
      totalClash: clashes.length,
      openCount: clashes.length - closedCount,
      closedCount,
      overdueCount,
      mttrDays:
        resolvedForMttr > 0
          ? Math.round((resolutionMsTotal / resolvedForMttr / 86_400_000) * 10) / 10
          : null,
      trend,
      byDiscipline: this.countBy(
        clashes,
        'disciplineId',
        disciplines.map((d) => ({ id: d.id, label: d.code })),
      ),
      byPriority: this.countBy(
        clashes,
        'priorityId',
        [...priorities].sort((a, b) => a.weight - b.weight).map((p) => ({ id: p.id, label: p.name })),
      ),
      byZone: this.countBy(
        clashes,
        'zoneId',
        zones.map((z) => ({ id: z.id, label: `${z.level} · ${z.name}` })),
      ),
    };
  }

  private countBy<T extends Record<string, unknown>>(
    clashes: T[],
    key: keyof T,
    source: { id: string; label: string }[],
  ): Slice[] {
    const counts = new Map<string, number>();
    for (const c of clashes) {
      const id = c[key] as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return source.map((s) => ({ id: s.id, label: s.label, value: counts.get(s.id) ?? 0 }));
  }

  async findDetail(id: string) {
    const clash = await this.prisma.clash.findUnique({ where: { id } });
    if (!clash) throw new NotFoundException('Clash tidak ditemukan.');

    const [comments, auditLogs, attachments] = await Promise.all([
      this.prisma.comment.findMany({ where: { clashId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.auditLog.findMany({ where: { clashId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.attachment.findMany({ where: { clashId: id }, orderBy: { createdAt: 'asc' } }),
    ]);

    return { ...clash, comments, auditLogs, attachments };
  }

  // --- Attachments ---------------------------------------------------------------

  async addAttachments(clashId: string, files: Express.Multer.File[], user: AuthUser) {
    const clash = await this.prisma.clash.findUnique({ where: { id: clashId } });
    if (!clash) throw new NotFoundException('Clash tidak ditemukan.');

    const created = [];
    for (const file of files) {
      const { key } = await this.storage.save(file.buffer, clash.id, file.originalname);
      created.push(
        await this.prisma.attachment.create({
          data: {
            clashId: clash.id,
            fileName: file.originalname,
            fileUrl: key,
            fileType: file.mimetype,
            sizeBytes: file.size,
            uploadedById: user.id,
          },
        }),
      );
    }
    return created;
  }

  async getAttachmentForDownload(clashId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.clashId !== clashId) {
      throw new NotFoundException('Lampiran tidak ditemukan.');
    }
    return { attachment, stream: this.storage.readStream(attachment.fileUrl) };
  }

  // --- Create ------------------------------------------------------------------

  async create(dto: CreateClashDto, user: AuthUser) {
    const project = await this.currentProject();

    const [discipline, zone, priority, openStatus] = await Promise.all([
      this.prisma.discipline.findUnique({ where: { id: dto.disciplineId } }),
      this.prisma.zone.findUnique({ where: { id: dto.zoneId } }),
      this.prisma.priority.findUnique({ where: { id: dto.priorityId } }),
      this.prisma.status.findFirst({ orderBy: { sequence: 'asc' } }),
    ]);

    if (!discipline || discipline.projectId !== project.id) {
      throw new BadRequestException('Disiplin tidak valid.');
    }
    if (!zone || zone.projectId !== project.id) {
      throw new BadRequestException('Zona tidak valid.');
    }
    if (!priority) throw new BadRequestException('Prioritas tidak valid.');
    if (!openStatus) throw new BadRequestException('Belum ada status yang dikonfigurasi.');

    const nowIso = new Date();

    // The unique code embeds a per-discipline sequence number. Two concurrent
    // creates for the same discipline can race for the same number, so retry
    // once on the unique-constraint violation with a freshly counted value.
    for (let attempt = 0; attempt < 2; attempt++) {
      const count = await this.prisma.clash.count({ where: { disciplineId: discipline.id } });
      const uniqueCode = `${project.code}-${discipline.code}-${String(count + 1).padStart(4, '0')}`;

      try {
        return await this.prisma.$transaction(async (tx) => {
          const clash = await tx.clash.create({
            data: {
              uniqueCode,
              projectId: project.id,
              title: dto.title.trim(),
              description: dto.description.trim(),
              disciplineId: discipline.id,
              zoneId: zone.id,
              statusId: openStatus.id,
              priorityId: priority.id,
              reporterId: user.id,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            },
          });

          await tx.auditLog.create({
            data: { clashId: clash.id, actorId: user.id, action: 'created', createdAt: nowIso },
          });

          return clash;
        });
      } catch (error) {
        const isUniqueClash =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isUniqueClash || attempt === 1) throw error;
        // fall through and retry with a recomputed count
      }
    }
    throw new BadRequestException('Gagal membuat kode unik clash, coba lagi.');
  }

  // --- Update ------------------------------------------------------------------

  async update(id: string, dto: UpdateClashDto, user: AuthUser) {
    const clash = await this.prisma.clash.findUnique({ where: { id } });
    if (!clash) throw new NotFoundException('Clash tidak ditemukan.');

    this.assertCanEdit(user, clash.assigneeId, clash.reporterId);
    const patch = await this.buildAllowedPatch(user, clash, dto);

    const updated = await this.applyPatch(clash, patch, user.id);
    return updated ?? clash;
  }

  async bulkUpdate(dto: BulkUpdateClashDto, user: AuthUser) {
    // Reached only by Coordinator/Admin (enforced by @Roles on the route),
    // who may edit any clash and any field — no per-item RBAC needed here.
    let updated = 0;

    for (const id of dto.ids) {
      const clash = await this.prisma.clash.findUnique({ where: { id } });
      if (!clash) continue;

      const result = await this.applyPatch(clash, dto.patch, user.id);
      if (result) updated++;
    }

    return { updated };
  }

  // --- Comments ------------------------------------------------------------------

  async addComment(clashId: string, dto: CreateCommentDto, user: AuthUser) {
    const clash = await this.prisma.clash.findUnique({ where: { id: clashId } });
    if (!clash) throw new NotFoundException('Clash tidak ditemukan.');

    return this.prisma.comment.create({
      data: { clashId, authorId: user.id, content: dto.content.trim() },
    });
  }

  // --- RBAC helpers ------------------------------------------------------------

  private assertCanEdit(user: AuthUser, assigneeId: string | null, reporterId: string) {
    if (user.role === Role.COORDINATOR || user.role === Role.ADMIN) return;
    if (user.role === Role.ENGINEER && (assigneeId === user.id || reporterId === user.id)) return;
    throw new ForbiddenException('Anda tidak berhak mengubah clash ini.');
  }

  /**
   * Coordinator/Admin may set any of the four fields. An Engineer may only
   * move status, and only one step forward into a non-closed state — never
   * reassign, reprioritise, or change the due date (the frontend never shows
   * those controls to them; this is the actual enforcement).
   */
  private async buildAllowedPatch(
    user: AuthUser,
    clash: { statusId: string },
    dto: UpdateClashDto,
  ): Promise<Patch> {
    if (user.role === Role.COORDINATOR || user.role === Role.ADMIN) {
      if (dto.statusId !== undefined && dto.statusId !== clash.statusId) {
        await this.assertStatusExists(dto.statusId);
      }
      return {
        statusId: dto.statusId,
        priorityId: dto.priorityId,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate,
      };
    }

    // Engineer.
    if (dto.priorityId !== undefined || dto.assigneeId !== undefined || dto.dueDate !== undefined) {
      throw new ForbiddenException(
        'Engineer hanya dapat mengubah status, bukan prioritas, assignee, atau due date.',
      );
    }
    if (dto.statusId === undefined) return {};

    await this.assertEngineerStatusTransition(clash.statusId, dto.statusId);
    return { statusId: dto.statusId };
  }

  private async assertStatusExists(statusId: string) {
    const status = await this.prisma.status.findUnique({ where: { id: statusId } });
    if (!status) throw new BadRequestException('Status tidak valid.');
  }

  private async assertEngineerStatusTransition(currentId: string, nextId: string) {
    const [current, next] = await Promise.all([
      this.prisma.status.findUnique({ where: { id: currentId } }),
      this.prisma.status.findUnique({ where: { id: nextId } }),
    ]);
    if (!current || !next) throw new BadRequestException('Status tidak valid.');

    const isOneStepForward = next.sequence === current.sequence + 1;
    if (!isOneStepForward || next.isClosedState) {
      throw new ForbiddenException(
        'Engineer hanya dapat memajukan status satu langkah dan tidak dapat menutup clash.',
      );
    }
  }

  // --- Shared write path ---------------------------------------------------

  /**
   * Applies whichever fields in `patch` actually changed, writes one AuditLog
   * row per changed field, and updates closedAt when the status crosses in or
   * out of a closed state. Returns null (no-op) if nothing actually changed —
   * callers use that to decide whether a bulk item counted as "updated".
   */
  private async applyPatch(
    clash: {
      id: string;
      statusId: string;
      priorityId: string;
      assigneeId: string | null;
      dueDate: Date | null;
      closedAt: Date | null;
    },
    patch: Patch,
    actorId: string,
  ) {
    const entries = (Object.entries(patch) as [PatchableField, PatchValue][]).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length === 0) return null;

    // String snapshot of the current row, so old/new comparisons and labels
    // share one representation regardless of the underlying column type.
    const current: Patch = {
      statusId: clash.statusId,
      priorityId: clash.priorityId,
      assigneeId: clash.assigneeId,
      dueDate: clash.dueDate ? clash.dueDate.toISOString() : null,
    };

    const nowIso = new Date();
    // Unchecked update: every field here is a scalar FK we've already
    // validated exists, so bypassing the relation-connect ceremony is safe.
    const data: Prisma.ClashUncheckedUpdateInput = {};
    const auditRows: Prisma.AuditLogCreateManyInput[] = [];

    for (const [field, rawValue] of entries) {
      const oldValue = current[field];
      if (this.sameValue(field, oldValue, rawValue)) continue;

      const [oldLabel, newLabel] = await Promise.all([
        this.labelFor(field, oldValue),
        this.labelFor(field, rawValue),
      ]);

      switch (field) {
        case 'statusId': {
          const value = rawValue as string;
          data.statusId = value;
          const nextStatus = await this.prisma.status.findUnique({ where: { id: value } });
          data.closedAt = nextStatus?.isClosedState ? nowIso : null;
          break;
        }
        case 'priorityId':
          data.priorityId = rawValue as string;
          break;
        case 'assigneeId':
          data.assigneeId = rawValue;
          break;
        case 'dueDate':
          data.dueDate = rawValue ? new Date(rawValue) : null;
          break;
      }

      auditRows.push({
        clashId: clash.id,
        actorId,
        action: 'updated',
        field,
        oldValue: oldLabel,
        newValue: newLabel,
        createdAt: nowIso,
      });
    }

    if (auditRows.length === 0) return null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clash.update({ where: { id: clash.id }, data });
      await tx.auditLog.createMany({ data: auditRows });
      return updated;
    });
  }

  private sameValue(field: PatchableField, oldValue: PatchValue, newValue: PatchValue): boolean {
    if (field === 'dueDate') {
      const oldTime = oldValue ? new Date(oldValue).getTime() : null;
      const newTime = newValue ? new Date(newValue).getTime() : null;
      return oldTime === newTime;
    }
    return oldValue === newValue;
  }

  private async labelFor(field: PatchableField, value: PatchValue): Promise<string> {
    if (value === null || value === undefined) return '-';
    switch (field) {
      case 'statusId':
        return (await this.prisma.status.findUnique({ where: { id: value } }))?.name ?? value;
      case 'priorityId':
        return (await this.prisma.priority.findUnique({ where: { id: value } }))?.name ?? value;
      case 'assigneeId':
        return (await this.prisma.user.findUnique({ where: { id: value } }))?.name ?? value;
      case 'dueDate':
        return value;
    }
  }
}
