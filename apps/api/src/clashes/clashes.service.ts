import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttachmentRole, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../auth/auth.types';
import { NOT_DELETED } from './clash-scope';
import { allocateLowestFreeSeq, allocateNextSeq, formatClashCode, lockDiscipline } from './clash-code';
import {
  BulkUpdateClashDto,
  CreateClashDto,
  CreateCommentDto,
  DashboardMetricsQueryDto,
  ListClashesQueryDto,
  UpdateClashDto,
} from './dto/clash.dto';

type PatchableField =
  | 'statusId'
  | 'priorityId'
  | 'assigneeId'
  | 'dueDate'
  | 'resolveProposed'
  | 'resolveByConsultant';
type PatchValue = string | null | undefined;
type Patch = Partial<Record<PatchableField, PatchValue>>;

/** Hard ceiling on ClashesService.export() regardless of how many rows a
 * filter set actually matches — see that method's comment. */
const EXPORT_MAX_ROWS = 5000;

/**
 * Far lower than EXPORT_MAX_ROWS because the two are not comparable: an
 * export row is a handful of strings, whereas a report row makes the browser
 * download, decode, flatten markup onto, and re-encode up to TWO images. At
 * 300 rows that is already up to 600 image round trips and one to three
 * minutes of work — see src/lib/report/ on the frontend.
 */
const REPORT_MAX_ROWS = 300;

/**
 * 15 minutes instead of StorageService.signKey()'s 5-minute default: a
 * 300-row report can spend longer than 5 minutes fetching images, and a URL
 * that expires mid-run turns into a hole in the finished spreadsheet. The
 * trade-off is real and deliberate — a signed URL cannot be revoked once
 * issued, so this widens the window in which a leaked link still works. The
 * client also falls back to the authenticated download route on 403, so this
 * is belt-and-braces rather than the only defence.
 */
const REPORT_SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** Roles that can appear in the report's two image columns. */
const REPORT_IMAGE_ROLES = [AttachmentRole.ORIGINAL, AttachmentRole.CLASH_DETECTION] as const;

/** AuditLog.oldValue/newValue are unbounded TEXT, but the Riwayat timeline
 * renders them inline — a 2000-character resolve note would wreck it. */
const AUDIT_LABEL_MAX = 120;

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
    private readonly config: ConfigService,
  ) {}

  /**
   * Kill switch — see CLASH_REPORT_ENABLED in config/env.validation.ts.
   *
   * Compares against `false` rather than checking truthiness: Joi declares
   * this key as a boolean with `.default(true)`, so ConfigService hands back
   * a real boolean (verified, not assumed — a malformed value fails boot
   * instead of reaching here). Only an explicit false disables the feature;
   * an unset key keeps it on.
   */
  isReportEnabled(): boolean {
    return this.config.get<boolean>('CLASH_REPORT_ENABLED') !== false;
  }

  /**
   * Loads a clash and verifies it belongs to `projectId` — the guard for
   * every resource-nested route (comments, attachments, update, detail).
   * A clash that exists but belongs to a different project is reported as
   * NotFound, not Forbidden, so callers can't use this to probe which ids
   * exist in projects they aren't scoped into.
   *
   * Soft-deleted clashes are excluded by default (404, same as a genuinely
   * missing id) — pass `includeDeleted: true` only from restore(), the one
   * place that legitimately needs to load a deleted row.
   */
  private async assertClashInProject(
    clashId: string,
    projectId: string,
    opts?: { includeDeleted?: boolean },
  ) {
    const clash = await this.prisma.clash.findFirst({
      where: { id: clashId, ...(opts?.includeDeleted ? {} : NOT_DELETED) },
    });
    if (!clash || clash.projectId !== projectId) {
      throw new NotFoundException('Clash tidak ditemukan.');
    }
    return clash;
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * Filters/sorts/paginates server-side — see RegisterView.tsx's FiltersState
   * for the param shape this mirrors.
   *
   * `query.deleted` switches from the normal (non-deleted) list to the
   * trash bin — Admin only, since it's the only role that can restore.
   */
  async list(query: ListClashesQueryDto, projectId: string, user: AuthUser) {
    if (query.deleted && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Hanya Admin yang dapat melihat clash yang terhapus.');
    }

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

  /**
   * Same filters/sort as list() but unpaginated (up to EXPORT_MAX_ROWS) —
   * backs the Register's Excel/PDF export buttons. Its own endpoint/method
   * rather than list() with a huge pageSize (the old approach): that let one
   * authenticated user repeatedly request the DB's most expensive possible
   * page, and the row cap here is enforced server-side instead of trusting
   * whatever pageSize the client sends. `total` may exceed the returned
   * `data.length` if a filter set matches more than EXPORT_MAX_ROWS rows.
   */
  async export(query: ListClashesQueryDto, projectId: string, user: AuthUser) {
    if (query.deleted && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Hanya Admin yang dapat melihat clash yang terhapus.');
    }

    const where = this.buildListWhere(projectId, query);
    const orderBy = this.buildListOrderBy(query.sort, query.dir);

    const [data, total] = await Promise.all([
      this.prisma.clash.findMany({ where, orderBy, take: EXPORT_MAX_ROWS }),
      this.prisma.clash.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Backs the Register's "Export Laporan Clash" button — the consultant-format
   * xlsx with two image columns per row, built client-side (see
   * src/lib/report/). Same filters/sort as list()/export(), but returns joined
   * names plus, per clash, the ORIGINAL and CLASH_DETECTION attachments with
   * signed URLs and their markup so the browser can flatten and embed them.
   *
   * A separate route from export() rather than a flag on it: export() feeds
   * two shipped, working buttons, and reshaping its response would put those
   * at risk for a feature that may yet be turned off (CLASH_REPORT_ENABLED).
   *
   * Exactly FOUR queries regardless of row count — the attachment and
   * annotation lookups are batched with `in`, never per-clash. There is a
   * regression test pinning that; an N+1 here would mean 300 clashes issuing
   * 600+ round trips before the browser has downloaded a single image.
   *
   * When one clash has several attachments of the same role the NEWEST
   * (createdAt desc) wins — re-tagging a better screenshot should supersede
   * the old one without forcing a delete. Surfaced in the UI copy too.
   */
  async report(query: ListClashesQueryDto, projectId: string, user: AuthUser) {
    if (!this.isReportEnabled()) {
      // 404, not 403: a disabled feature should look absent rather than
      // advertise that it exists and is being withheld.
      throw new NotFoundException('Fitur laporan clash tidak tersedia.');
    }
    if (query.deleted && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Hanya Admin yang dapat melihat clash yang terhapus.');
    }

    const where = this.buildListWhere(projectId, query);
    const orderBy = this.buildListOrderBy(query.sort, query.dir);

    const [clashes, total] = await Promise.all([
      this.prisma.clash.findMany({
        where,
        orderBy,
        take: REPORT_MAX_ROWS,
        include: {
          discipline: { select: { id: true, code: true, name: true } },
          zone: { select: { id: true, name: true, level: true } },
          status: { select: { id: true, name: true } },
        },
      }),
      this.prisma.clash.count({ where }),
    ]);

    const clashIds = clashes.map((c) => c.id);

    const attachments = clashIds.length
      ? await this.prisma.attachment.findMany({
          where: { clashId: { in: clashIds }, role: { in: [...REPORT_IMAGE_ROLES] } },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    // First write wins because the query is already sorted newest-first.
    const picked = new Map<string, { original?: typeof attachments[number]; clash?: typeof attachments[number] }>();
    for (const a of attachments) {
      const slot = picked.get(a.clashId) ?? {};
      if (a.role === AttachmentRole.ORIGINAL) slot.original ??= a;
      else slot.clash ??= a;
      picked.set(a.clashId, slot);
    }

    const pickedIds = [...picked.values()].flatMap((s) =>
      [s.original?.id, s.clash?.id].filter((id): id is string => Boolean(id)),
    );
    const annotations = pickedIds.length
      ? await this.prisma.annotation.findMany({
          where: { attachmentId: { in: pickedIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const annotationsByAttachment = new Map<string, typeof annotations>();
    for (const an of annotations) {
      const list = annotationsByAttachment.get(an.attachmentId) ?? [];
      list.push(an);
      annotationsByAttachment.set(an.attachmentId, list);
    }

    const toImageRef = (a: (typeof attachments)[number] | undefined) => {
      if (!a) return null;
      const { token, expiresAt } = this.storage.signKey(
        this.signedUrlSubject(a.id),
        REPORT_SIGNED_URL_TTL_MS,
      );
      return {
        attachmentId: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        url: `/clashes/attachments/${a.id}/signed?token=${token}&expiresAt=${expiresAt}`,
        expiresAt,
        annotations: annotationsByAttachment.get(a.id) ?? [],
      };
    };

    const data = clashes.map((c) => {
      const slot = picked.get(c.id);
      return {
        id: c.id,
        uniqueCode: c.uniqueCode,
        title: c.title,
        description: c.description,
        createdAt: c.createdAt,
        closedAt: c.closedAt,
        resolveProposed: c.resolveProposed,
        resolveByConsultant: c.resolveByConsultant,
        discipline: c.discipline,
        zone: c.zone,
        status: c.status,
        original: toImageRef(slot?.original),
        clashDetection: toImageRef(slot?.clash),
      };
    });

    // `maxRows` lets the client word its own truncation warning instead of
    // hard-coding a number that would drift from this constant.
    return { data, total, maxRows: REPORT_MAX_ROWS };
  }

  private buildListWhere(projectId: string, query: ListClashesQueryDto): Prisma.ClashWhereInput {
    const where: Prisma.ClashWhereInput = {
      projectId,
      ...(query.deleted ? { deletedAt: { not: null } } : NOT_DELETED),
    };

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
        ...NOT_DELETED,
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

  /**
   * Reachable from any clash's detail page, not just at creation time —
   * ENGINEER/COORDINATOR/ADMIN may attach files to any clash in their
   * project. Deliberately does NOT call assertCanEdit(): unlike editing the
   * clash's own fields, adding evidence isn't restricted to the
   * assignee/reporter (see the PRD's attachment permission matrix).
   */
  async addAttachments(
    clashId: string,
    files: Express.Multer.File[],
    user: AuthUser,
    projectId: string,
  ) {
    const clash = await this.assertClashInProject(clashId, projectId);

    const created = [];
    for (const file of files) {
      const { key } = await this.storage.saveFromPath(file.path, clash.id, file.originalname);
      const attachment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.attachment.create({
          data: {
            clashId: clash.id,
            fileName: file.originalname,
            fileUrl: key,
            fileType: file.mimetype,
            sizeBytes: file.size,
            uploadedById: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            clashId: clash.id,
            actorId: user.id,
            action: 'attachment_added',
            field: 'attachment',
            newValue: file.originalname,
          },
        });
        return row;
      });
      created.push(attachment);
    }
    return created;
  }

  /**
   * ProjectContextGuard already confirmed the caller may use `projectId`;
   * this just confirms the clash/attachment pair actually belongs to it, so
   * membership on Project A can't be used to pull an attachment id guessed
   * or observed from Project B. Public so AnnotationsService can reuse it
   * for the same scoping check rather than duplicating it.
   */
  async assertAttachmentInClash(clashId: string, attachmentId: string, projectId: string) {
    await this.assertClashInProject(clashId, projectId);

    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.clashId !== clashId) {
      throw new NotFoundException('Lampiran tidak ditemukan.');
    }
    return attachment;
  }

  async getAttachmentForDownload(clashId: string, attachmentId: string, user: AuthUser, projectId: string) {
    const attachment = await this.assertAttachmentInClash(clashId, attachmentId, projectId);
    return { attachment, stream: this.storage.readStream(attachment.fileUrl) };
  }

  /**
   * ENGINEER may delete only their own upload; COORDINATOR/ADMIN may delete
   * anyone's — keyed on uploadedById, not assignee/reporter, so this is a
   * distinct rule from assertCanEdit(). The DB row is hard-deleted (no
   * deletedAt column on Attachment — see clashes.service.ts's Clash
   * soft-delete for why that's a different situation): its only historical
   * value is the filename, which the AuditLog row preserves. The on-disk
   * file is unlinked after the transaction commits, fire-and-forget, so a
   * storage hiccup never leaves the DB and disk disagreeing about whether
   * the request "succeeded" — an orphaned file is harmless; a deleted row
   * whose request 500s is not.
   */
  async deleteAttachment(clashId: string, attachmentId: string, user: AuthUser, projectId: string) {
    const attachment = await this.assertAttachmentInClash(clashId, attachmentId, projectId);
    this.assertCanManageAttachment(user, attachment.uploadedById);

    await this.prisma.$transaction(async (tx) => {
      await tx.annotation.deleteMany({ where: { attachmentId: attachment.id } });
      await tx.attachment.delete({ where: { id: attachment.id } });
      await tx.auditLog.create({
        data: {
          clashId,
          actorId: user.id,
          action: 'attachment_deleted',
          field: 'attachment',
          oldValue: attachment.fileName,
        },
      });
    });

    this.storage
      .delete(attachment.fileUrl)
      .catch((error: Error) => this.logger.warn(`Gagal menghapus file lampiran: ${error.message}`));

    return { id: attachment.id };
  }

  /**
   * Tagging an attachment's report role decides which photo a consultant
   * sees in the finished document, so it is gated exactly like deleting one:
   * ENGINEER may only touch their own upload, COORDINATOR/ADMIN anyone's.
   * One rule shared by both call sites rather than two that can drift.
   */
  private assertCanManageAttachment(user: AuthUser, uploadedById: string) {
    if (user.role === Role.COORDINATOR || user.role === Role.ADMIN) return;
    if (user.role === Role.ENGINEER && uploadedById === user.id) return;
    throw new ForbiddenException('Anda hanya dapat mengelola lampiran yang Anda unggah.');
  }

  /**
   * Sets which column of the "Tabel Clash Detection" report this attachment
   * feeds. Audited because it changes what ends up in a document sent
   * outside the company — "who put this photo in the report" needs an answer.
   */
  async updateAttachmentRole(
    clashId: string,
    attachmentId: string,
    role: AttachmentRole,
    user: AuthUser,
    projectId: string,
  ) {
    const attachment = await this.assertAttachmentInClash(clashId, attachmentId, projectId);
    this.assertCanManageAttachment(user, attachment.uploadedById);

    if (attachment.role === role) return attachment;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attachment.update({ where: { id: attachment.id }, data: { role } });
      await tx.auditLog.create({
        data: {
          clashId,
          actorId: user.id,
          action: 'attachment_role_changed',
          field: attachment.fileName,
          oldValue: attachment.role,
          newValue: role,
        },
      });
      return updated;
    });
  }

  /**
   * Same RBAC/scoping as getAttachmentForDownload, but instead of streaming
   * the file now, hands back a short-lived signed token the caller can use
   * against the @Public() route below without carrying auth headers/cookies
   * — the piece that matters once storage moves off local disk to S3/R2,
   * where the browser would fetch bytes straight from the object store
   * rather than proxying through this API. The token is bound to
   * `attachmentId`, not the raw storage key, so the public route can look
   * the attachment up by (indexed) id instead of trusting a client-supplied
   * path — see streamBySignedToken().
   */
  async getAttachmentSignedUrl(clashId: string, attachmentId: string, user: AuthUser, projectId: string) {
    const attachment = await this.assertAttachmentInClash(clashId, attachmentId, projectId);
    const { token, expiresAt } = this.storage.signKey(this.signedUrlSubject(attachment.id));
    return {
      url: `/clashes/attachments/${attachment.id}/signed?token=${token}&expiresAt=${expiresAt}`,
      expiresAt,
    };
  }

  /**
   * @Public() counterpart of getAttachmentSignedUrl — no user/project
   * context available here (or trusted, if present), so authorization is
   * entirely the signature: it proves this exact attachmentId+expiry was
   * issued by getAttachmentSignedUrl above, nothing more (no revocation
   * once issued, matching a normal short-TTL signed URL's guarantees).
   */
  async streamBySignedToken(attachmentId: string, token: string, expiresAt: number) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('Lampiran tidak ditemukan.');

    if (!this.storage.verifySignedKey(this.signedUrlSubject(attachment.id), token, expiresAt)) {
      throw new ForbiddenException('Tautan tidak valid atau sudah kedaluwarsa.');
    }

    return { attachment, stream: this.storage.readStream(attachment.fileUrl) };
  }

  /** What actually gets signed — attachmentId, not the storage key itself,
   * so a signed URL never reveals (or requires trusting) a filesystem path. */
  private signedUrlSubject(attachmentId: string): string {
    return `attachment:${attachmentId}`;
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
   * The code embeds a per-discipline sequence number (`seq`) allocated by
   * allocateLowestFreeSeq, which fills gaps left by soft-deleted clashes —
   * see the Clash.deletedAt doc comment in schema.prisma. Concurrent creates
   * for the same discipline are serialized by an xact-scoped advisory lock
   * (lockDiscipline) rather than left to retry alone: without the lock, N
   * concurrent creates would all read the same gap, N-1 would fail on the
   * partial unique index, and retrying would just re-read the same next gap
   * again (O(N^2) wasted inserts, unbounded tail latency). The lock makes
   * this O(N) with zero wasted inserts. The bounded retry loop below still
   * exists for the residual case where a concurrent rename transaction
   * (ProjectsService.update / MasterDataService.updateDiscipline) is
   * rewriting codes into this discipline's namespace at the same time — the
   * partial unique index remains the real arbiter.
   *
   * A collision on (projectId, externalId) is a different situation — it
   * means this exact import row already exists — so it's surfaced as
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

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await lockDiscipline(tx, input.discipline.id);
            const seq = await allocateLowestFreeSeq(tx, input.discipline.id);
            const uniqueCode = formatClashCode(input.project.code, input.discipline.code, seq);

            const clash = await tx.clash.create({
              data: {
                uniqueCode,
                seq,
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
          },
          { maxWait: 10_000, timeout: 20_000 },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
          if (target.includes('externalId')) {
            throw new DuplicateExternalIdError(
              `External id "${input.externalId}" sudah dipakai di proyek ini.`,
            );
          }
          if (attempt < 2) continue; // code/seq race — retry with a freshly allocated value
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
    const clashes = await this.prisma.clash.findMany({
      where: { id: { in: dto.ids }, projectId, ...NOT_DELETED },
    });
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

  // --- Delete / restore ---------------------------------------------------------

  /**
   * Admin-only soft delete: sets deletedAt so the clash drops out of every
   * read path (list/metrics/bulkUpdate/detail/comments/attachments), while
   * the row itself, its comments, audit log, and attachment files are left
   * untouched. uniqueCode/seq ARE freed by this — a new clash in the same
   * discipline can now be allocated this clash's old seq (see clash-code.ts)
   * — so restore() below is no longer guaranteed to be lossless; it recovers
   * the old code only if nothing has claimed it since. externalId is left
   * untouched by this method, which is what actually keeps a re-import of
   * the same externalId "skipped" (see the comment in ImportProcessor.importRow
   * — do NOT make the (projectId, externalId) constraint partial too, or a
   * re-import would resurrect deleted rows as duplicates).
   */
  async softDelete(id: string, user: AuthUser, projectId: string) {
    await this.assertClashInProject(id, projectId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clash.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({ data: { clashId: id, actorId: user.id, action: 'deleted' } });
      return updated;
    });
  }

  /**
   * Reverses softDelete. Fast path: if nothing has since claimed this
   * clash's old uniqueCode/seq, restore it unchanged. Otherwise — some other
   * clash in the discipline was allocated that seq while this one was
   * deleted — allocate a fresh seq at the END of the sequence (not a gap,
   * to avoid churning some other live clash's would-be next code) and
   * record the reassignment as its own AuditLog entry so the detail page's
   * timeline explains the code change (see clashes/[id]/page.tsx auditText).
   */
  async restore(id: string, user: AuthUser, projectId: string) {
    const clash = await this.assertClashInProject(id, projectId, { includeDeleted: true });
    if (!clash.deletedAt) {
      throw new BadRequestException('Clash ini tidak dalam status terhapus.');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockDiscipline(tx, clash.disciplineId);

      const conflict = await tx.clash.findFirst({
        where: {
          disciplineId: clash.disciplineId,
          deletedAt: null,
          OR: [{ uniqueCode: clash.uniqueCode }, { seq: clash.seq }],
        },
        select: { id: true },
      });

      if (!conflict) {
        const updated = await tx.clash.update({ where: { id }, data: { deletedAt: null } });
        await tx.auditLog.create({ data: { clashId: id, actorId: user.id, action: 'restored' } });
        return updated;
      }

      const [project, discipline] = await Promise.all([
        tx.project.findUniqueOrThrow({ where: { id: clash.projectId } }),
        tx.discipline.findUniqueOrThrow({ where: { id: clash.disciplineId } }),
      ]);
      const newSeq = await allocateNextSeq(tx, clash.disciplineId);
      const newCode = formatClashCode(project.code, discipline.code, newSeq);
      const oldCode = clash.uniqueCode;

      const updated = await tx.clash.update({
        where: { id },
        data: { deletedAt: null, seq: newSeq, uniqueCode: newCode },
      });
      await tx.auditLog.create({ data: { clashId: id, actorId: user.id, action: 'restored' } });
      await tx.auditLog.create({
        data: {
          clashId: id,
          actorId: user.id,
          action: 'code_reassigned',
          field: 'uniqueCode',
          oldValue: oldCode,
          newValue: newCode,
        },
      });
      return updated;
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
        resolveProposed: dto.resolveProposed,
        resolveByConsultant: dto.resolveByConsultant,
      };
    }

    // Engineer.
    if (dto.priorityId !== undefined || dto.assigneeId !== undefined || dto.dueDate !== undefined) {
      throw new ForbiddenException(
        'Engineer hanya dapat mengubah status, bukan prioritas, assignee, atau due date.',
      );
    }
    // resolveByConsultant records what the consultant answered — an Engineer
    // relaying that second-hand is how a report ends up misquoting an
    // external party. resolveProposed is TATA's own proposal, which is
    // exactly what the Engineer working the clash is there to write.
    if (dto.resolveByConsultant !== undefined) {
      throw new ForbiddenException(
        'Hanya Coordinator atau Admin yang dapat mengisi jawaban konsultan.',
      );
    }

    const patch: Patch = {};
    if (dto.resolveProposed !== undefined) patch.resolveProposed = dto.resolveProposed;
    if (dto.statusId !== undefined) {
      await this.assertEngineerStatusTransition(clash.statusId, dto.statusId);
      patch.statusId = dto.statusId;
    }
    return patch;
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
      resolveProposed?: string | null;
      resolveByConsultant?: string | null;
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
      resolveProposed: clash.resolveProposed ?? null,
      resolveByConsultant: clash.resolveByConsultant ?? null,
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
        // Empty string is normalised to null so "cleared the field" has one
        // representation in the DB rather than two that render identically.
        case 'resolveProposed':
          data.resolveProposed = rawValue ? rawValue : null;
          break;
        case 'resolveByConsultant':
          data.resolveByConsultant = rawValue ? rawValue : null;
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
    // "" and null both mean "not filled in" for the free-text resolve fields
    // (applyPatch stores null for both), so clearing an already-empty field
    // must not produce a spurious audit row.
    if (field === 'resolveProposed' || field === 'resolveByConsultant') {
      return (oldValue ?? '') === (newValue ?? '');
    }
    return oldValue === newValue;
  }

  private async labelFor(field: PatchableField, value: PatchValue): Promise<string> {
    if (value === null || value === undefined || value === '') return '-';
    switch (field) {
      case 'statusId':
        return (await this.prisma.status.findUnique({ where: { id: value } }))?.name ?? value;
      case 'priorityId':
        return (await this.prisma.priority.findUnique({ where: { id: value } }))?.name ?? value;
      case 'assigneeId':
        return (await this.prisma.user.findUnique({ where: { id: value } }))?.name ?? value;
      case 'dueDate':
        return value;
      // Free text up to 2000 chars, but AuditLog rows render inline in the
      // Riwayat timeline — truncate rather than let one note swamp it.
      case 'resolveProposed':
      case 'resolveByConsultant':
        return value.length > AUDIT_LABEL_MAX ? `${value.slice(0, AUDIT_LABEL_MAX)}…` : value;
    }
  }
}
