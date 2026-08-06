import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/auth.types';
import {
  BulkUpdateClashDto,
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

/** Thrown by createClashRecord() when the row's externalId already exists in
 * the project — distinct from a plain retryable uniqueCode race so callers
 * (ImportProcessor) can treat it as a dedup skip rather than a hard failure. */
export class DuplicateExternalIdError extends Error {}

/**
 * Mirrors the RBAC rules the frontend already enforces for UX
 * (src/lib/lookup.ts canEditClash, src/lib/use-master-data.ts
 * allowedStatusTransitions) so a client that skips the UI cannot bypass them.
 */
@Injectable()
export class ClashesService {
  private readonly logger = new Logger(ClashesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Loads a clash and verifies it belongs to `projectId` — the guard for
   * every resource-nested route (comments, attachments, update, detail).
   * A clash that exists but belongs to a different project is reported as
   * NotFound, not Forbidden, so callers can't use this to probe which ids
   * exist in projects they aren't scoped into.
   */
  private async assertClashInProject(clashId: string, projectId: string) {
    const clash = await this.prisma.clash.findUnique({ where: { id: clashId } });
    if (!clash || clash.projectId !== projectId) {
      throw new NotFoundException('Clash tidak ditemukan.');
    }
    return clash;
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * Filters/sorts/paginates server-side — see RegisterView.tsx's FiltersState
   * for the param shape this mirrors. pageSize can go up to 10000 (see the
   * DTO), which is what lets the Register's export buttons reuse this same
   * method (page=1&pageSize=10000) instead of a separate unpaginated route.
   */
  async list(query: ListClashesQueryDto, projectId: string) {
    const where = this.buildListWhere(projectId, query);
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
  async metrics(query: DashboardMetricsQueryDto, projectId: string): Promise<DashboardMetrics> {
    const [disciplines, zones, priorities, statuses] = await Promise.all([
      this.prisma.discipline.findMany({ where: { projectId } }),
      this.prisma.zone.findMany({ where: { projectId } }),
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
        projectId,
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

  async findDetail(id: string, projectId: string) {
    const clash = await this.assertClashInProject(id, projectId);

    const [comments, auditLogs, attachments] = await Promise.all([
      this.prisma.comment.findMany({ where: { clashId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.auditLog.findMany({ where: { clashId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.attachment.findMany({ where: { clashId: id }, orderBy: { createdAt: 'asc' } }),
    ]);

    return { ...clash, comments, auditLogs, attachments };
  }

  // --- Attachments ---------------------------------------------------------------

  async addAttachments(
    clashId: string,
    files: Express.Multer.File[],
    user: AuthUser,
    projectId: string,
  ) {
    const clash = await this.assertClashInProject(clashId, projectId);

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

  /**
   * ProjectContextGuard already confirmed the caller may use `projectId`;
   * this just confirms the clash/attachment pair actually belongs to it, so
   * membership on Project A can't be used to pull an attachment id guessed
   * or observed from Project B.
   */
  async getAttachmentForDownload(clashId: string, attachmentId: string, user: AuthUser, projectId: string) {
    await this.assertClashInProject(clashId, projectId);

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.clashId !== clashId) {
      throw new NotFoundException('Lampiran tidak ditemukan.');
    }

    return { attachment, stream: this.storage.readStream(attachment.fileUrl) };
  }

  // --- Create ------------------------------------------------------------------

  async create(dto: CreateClashDto, user: AuthUser, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');

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

    return this.createClashRecord({
      project,
      discipline,
      zoneId: zone.id,
      priorityId: priority.id,
      statusId: openStatus.id,
      reporterId: user.id,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
    });
  }

  /**
   * Shared row-creation path for both the single-clash create() above and
   * ImportProcessor's per-row commit. Callers are responsible for resolving
   * and validating discipline/zone/priority/status first — this method only
   * owns generating the unique code and writing the Clash + AuditLog pair.
   *
   * The unique code embeds a per-discipline sequence number. Two concurrent
   * creates for the same discipline can race for the same number, so retry
   * once on a uniqueCode collision with a freshly counted value. A collision
   * on (projectId, externalId) is a different situation — it means this
   * exact import row already exists — so it's surfaced as
   * DuplicateExternalIdError instead of retried.
   */
  async createClashRecord(input: {
    project: { id: string; code: string };
    discipline: { id: string; code: string };
    zoneId: string;
    priorityId: string;
    statusId: string;
    reporterId: string;
    title: string;
    description: string;
    dueDate: Date | null;
    externalId?: string | null;
    auditAction?: string;
  }) {
    const nowIso = new Date();
    const auditAction = input.auditAction ?? 'created';

    for (let attempt = 0; attempt < 2; attempt++) {
      const count = await this.prisma.clash.count({ where: { disciplineId: input.discipline.id } });
      const uniqueCode = `${input.project.code}-${input.discipline.code}-${String(count + 1).padStart(4, '0')}`;

      try {
        return await this.prisma.$transaction(async (tx) => {
          const clash = await tx.clash.create({
            data: {
              uniqueCode,
              projectId: input.project.id,
              title: input.title.trim(),
              description: input.description.trim(),
              disciplineId: input.discipline.id,
              zoneId: input.zoneId,
              statusId: input.statusId,
              priorityId: input.priorityId,
              reporterId: input.reporterId,
              dueDate: input.dueDate,
              externalId: input.externalId ?? null,
            },
          });

          await tx.auditLog.create({
            data: { clashId: clash.id, actorId: input.reporterId, action: auditAction, createdAt: nowIso },
          });

          return clash;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
          if (target.includes('externalId')) {
            throw new DuplicateExternalIdError(
              `External id "${input.externalId}" sudah dipakai di proyek ini.`,
            );
          }
          if (attempt === 0) continue; // uniqueCode race — retry with a recomputed count
        }
        throw error;
      }
    }
    throw new BadRequestException('Gagal membuat kode unik clash, coba lagi.');
  }

  // --- Update ------------------------------------------------------------------

  async update(id: string, dto: UpdateClashDto, user: AuthUser, projectId: string) {
    const clash = await this.assertClashInProject(id, projectId);

    this.assertCanEdit(user, clash.assigneeId, clash.reporterId);
    const patch = await this.buildAllowedPatch(user, clash, dto);

    const updated = await this.applyPatch(clash, patch, user.id);
    return updated ?? clash;
  }

  async bulkUpdate(dto: BulkUpdateClashDto, user: AuthUser, projectId: string) {
    // Reached only by Coordinator/Admin (enforced by @Roles on the route),
    // who may edit any clash and any field — no per-item RBAC needed here.
    // Every id must belong to the active project: reject the whole batch
    // rather than silently skipping ids from another project, so a caller
    // can't use a partial 200 to probe which foreign ids exist.
    const clashes = await this.prisma.clash.findMany({ where: { id: { in: dto.ids }, projectId } });
    if (clashes.length !== dto.ids.length) {
      throw new NotFoundException('Satu atau lebih clash tidak ditemukan.');
    }

    // bulkUpdate never goes through buildAllowedPatch, so the assignee/Engineer
    // rule has to be enforced here explicitly. Checked once up front (not
    // per-item) so a bad assigneeId rejects the whole batch, not half of it.
    if (dto.patch.assigneeId !== undefined) {
      await this.assertAssigneeIsEngineer(dto.patch.assigneeId);
    }

    let updated = 0;
    for (const clash of clashes) {
      const result = await this.applyPatch(clash, dto.patch, user.id);
      if (result) updated++;
    }

    return { updated };
  }

  // --- Comments ------------------------------------------------------------------

  async addComment(clashId: string, dto: CreateCommentDto, user: AuthUser, projectId: string) {
    await this.assertClashInProject(clashId, projectId);

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
   * Coordinator/Admin may set any of the four fields, but assigneeId is
   * further restricted to active Engineers (or null, to unassign). An
   * Engineer may only move status, and only one step forward into a
   * non-closed state — never reassign, reprioritise, or change the due date
   * (the frontend never shows those controls to them; this is the actual
   * enforcement).
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
      if (dto.assigneeId !== undefined) {
        await this.assertAssigneeIsEngineer(dto.assigneeId);
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

  /** Unassigning (null/undefined) always passes. Assigning requires an active Engineer. */
  private async assertAssigneeIsEngineer(assigneeId: string | null | undefined) {
    if (assigneeId === null || assigneeId === undefined) return;
    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || assignee.role !== Role.ENGINEER || !assignee.isActive) {
      throw new BadRequestException('Assignee harus Engineer yang aktif.');
    }
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
      reporterId: string;
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
    // Unchecked update: every field here is a scalar FK already validated
    // by the caller (buildAllowedPatch / bulkUpdate), so bypassing the
    // relation-connect ceremony is safe.
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.clash.update({ where: { id: clash.id }, data });
      await tx.auditLog.createMany({ data: auditRows });
      return result;
    });

    this.publishNotifications(clash, auditRows, actorId, data.assigneeId as string | null | undefined);

    return updated;
  }

  /**
   * Fire-and-forget: a notification-queue hiccup (e.g. Redis unreachable)
   * must never fail the clash update itself, so failures are logged, not
   * thrown. Called after the transaction commits, so it only fires for
   * changes that actually landed.
   */
  private publishNotifications(
    clash: { id: string; assigneeId: string | null; reporterId: string },
    auditRows: Prisma.AuditLogCreateManyInput[],
    actorId: string,
    newAssigneeId: string | null | undefined,
  ): void {
    for (const row of auditRows) {
      if (row.field === 'assigneeId' && newAssigneeId) {
        this.notifications
          .enqueueAssigned(clash.id, newAssigneeId)
          .catch((error: Error) => this.logger.warn(`Gagal enqueue notifikasi assigned: ${error.message}`));
      }

      if (row.field === 'statusId') {
        const currentAssigneeId = newAssigneeId !== undefined ? newAssigneeId : clash.assigneeId;
        const recipients = [...new Set([currentAssigneeId, clash.reporterId])].filter(
          (id): id is string => Boolean(id) && id !== actorId,
        );
        if (recipients.length > 0) {
          this.notifications
            .enqueueStatusChange(clash.id, recipients, String(row.oldValue), String(row.newValue))
            .catch((error: Error) =>
              this.logger.warn(`Gagal enqueue notifikasi status_change: ${error.message}`),
            );
        }
      }
    }
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
