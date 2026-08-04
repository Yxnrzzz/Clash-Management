import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ImportJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ClashesService, DuplicateExternalIdError } from '../clashes/clashes.service';
import { parseCsv } from './parsers/csv.parser';
import { parseXml } from './parsers/xml.parser';
import { IMPORT_QUEUE, ImportJobPayload, ImportMapping, RowError } from './import.types';

const PROGRESS_FLUSH_EVERY = 25;

interface ResolvedRow {
  title: string;
  description: string;
  disciplineRaw: string;
  zoneRaw: string;
  priorityRaw: string;
  dueDateRaw: string;
  externalIdRaw: string;
}

/**
 * Consumes jobs enqueued by ImportService.commit(). Each row is validated,
 * resolved against master data, and written in its own transaction (via
 * ClashesService.createClashRecord) so one bad row never rolls back rows
 * that already succeeded — the opposite of wrapping the whole file in a
 * single $transaction.
 */
@Processor(IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clashes: ClashesService,
  ) {
    super();
  }

  async process(job: Job<ImportJobPayload>): Promise<void> {
    const importJob = await this.prisma.importJob.findUnique({ where: { id: job.data.jobId } });
    if (!importJob) {
      this.logger.warn(`ImportJob ${job.data.jobId} tidak ditemukan, dilewati.`);
      return;
    }

    await this.prisma.importJob.update({
      where: { id: importJob.id },
      data: { status: ImportJobStatus.RUNNING },
    });

    try {
      const project = await this.prisma.project.findUniqueOrThrow({ where: { id: importJob.projectId } });
      const mapping = importJob.mapping as unknown as ImportMapping;
      const buffer = await this.readStoredFile(importJob.storageKey);
      const text = buffer.toString('utf-8');
      const { columns, rows } = importJob.format === 'xml' ? parseXml(text) : parseCsv(text);
      const colIndex = (col: string) => columns.indexOf(col);

      const openStatus = await this.prisma.status.findFirst({ orderBy: { sequence: 'asc' } });
      if (!openStatus) {
        throw new Error('Belum ada status yang dikonfigurasi untuk proyek ini.');
      }

      // Loaded once and mutated in place as autoCreate adds new rows, so
      // later rows in the same file can reuse a master-data entry created
      // by an earlier row without a fresh query.
      const disciplines = await this.prisma.discipline.findMany({ where: { projectId: project.id } });
      const zones = await this.prisma.zone.findMany({ where: { projectId: project.id } });
      const priorities = await this.prisma.priority.findMany();

      let succeeded = 0;
      let failed = 0;
      let skipped = 0;
      const errors: RowError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2; // header = row 1, 1-indexed data rows start at 2
        const row = rows[i];
        const get = (col: string | undefined) => {
          if (!col) return '';
          const idx = colIndex(col);
          return idx >= 0 ? (row[idx] ?? '').trim() : '';
        };

        const resolved: ResolvedRow = {
          title: get(mapping.title),
          description: get(mapping.description),
          disciplineRaw: get(mapping.disciplineCode),
          zoneRaw: get(mapping.zoneName),
          priorityRaw: get(mapping.priorityName),
          dueDateRaw: mapping.dueDate ? get(mapping.dueDate) : '',
          externalIdRaw: mapping.externalId ? get(mapping.externalId) : '',
        };

        const outcome = await this.importRow({
          project,
          openStatusId: openStatus.id,
          reporterId: importJob.createdById,
          autoCreate: importJob.autoCreate,
          disciplines,
          zones,
          priorities,
          resolved,
          rowNumber,
        });

        if (outcome.kind === 'success') succeeded++;
        else if (outcome.kind === 'skipped') skipped++;
        else {
          failed++;
          errors.push({ rowNumber, reason: outcome.reason });
        }

        const processed = i + 1;
        if (processed % PROGRESS_FLUSH_EVERY === 0 || processed === rows.length) {
          await this.prisma.importJob.update({
            where: { id: importJob.id },
            data: {
              processedRows: processed,
              succeededRows: succeeded,
              failedRows: failed,
              skippedRows: skipped,
              errors: errors as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      await this.prisma.importJob.update({
        where: { id: importJob.id },
        data: { status: ImportJobStatus.DONE, finishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`ImportJob ${importJob.id} gagal: ${(error as Error).message}`, (error as Error).stack);
      await this.prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: ImportJobStatus.FAILED,
          finishedAt: new Date(),
          errors: [{ rowNumber: 0, reason: (error as Error).message }] as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async importRow(ctx: {
    project: { id: string; code: string };
    openStatusId: string;
    reporterId: string;
    autoCreate: boolean;
    disciplines: { id: string; code: string; name: string }[];
    zones: { id: string; name: string; level: string }[];
    priorities: { id: string; name: string; weight: number }[];
    resolved: ResolvedRow;
    rowNumber: number;
  }): Promise<{ kind: 'success' } | { kind: 'skipped' } | { kind: 'failed'; reason: string }> {
    const { resolved } = ctx;

    if (!resolved.title) return { kind: 'failed', reason: 'Judul kosong' };
    if (!resolved.description) return { kind: 'failed', reason: 'Deskripsi kosong' };
    if (!resolved.disciplineRaw) return { kind: 'failed', reason: 'Disiplin kosong' };
    if (!resolved.zoneRaw) return { kind: 'failed', reason: 'Zona kosong' };
    if (!resolved.priorityRaw) return { kind: 'failed', reason: 'Prioritas kosong' };

    let dueDate: Date | null = null;
    if (resolved.dueDateRaw) {
      const parsed = new Date(resolved.dueDateRaw);
      if (Number.isNaN(parsed.getTime())) {
        return { kind: 'failed', reason: `Tanggal due date tidak valid: "${resolved.dueDateRaw}"` };
      }
      dueDate = parsed;
    }

    // Dedup before attempting a create — the unique constraint on
    // (projectId, externalId) is the authoritative guard against a race
    // between two rows/jobs, this check just avoids the DB round trip and
    // gives a clean "skipped" outcome in the common (non-racing) case.
    const externalId = resolved.externalIdRaw || null;
    if (externalId) {
      const existing = await this.prisma.clash.findFirst({
        where: { projectId: ctx.project.id, externalId },
        select: { id: true },
      });
      if (existing) return { kind: 'skipped' };
    }

    const discipline = this.resolveOrCreateDiscipline(ctx, resolved.disciplineRaw);
    const zone = this.resolveOrCreateZone(ctx, resolved.zoneRaw);
    const priority = this.resolveOrCreatePriority(ctx, resolved.priorityRaw);

    const [disciplineRow, zoneRow, priorityRow] = await Promise.all([discipline, zone, priority]);

    if (!disciplineRow) {
      return { kind: 'failed', reason: `Disiplin tidak ditemukan: "${resolved.disciplineRaw}"` };
    }
    if (!zoneRow) {
      return { kind: 'failed', reason: `Zona tidak ditemukan: "${resolved.zoneRaw}"` };
    }
    if (!priorityRow) {
      return { kind: 'failed', reason: `Prioritas tidak ditemukan: "${resolved.priorityRaw}"` };
    }

    try {
      await this.clashes.createClashRecord({
        project: ctx.project,
        discipline: disciplineRow,
        zoneId: zoneRow.id,
        priorityId: priorityRow.id,
        statusId: ctx.openStatusId,
        reporterId: ctx.reporterId,
        title: resolved.title,
        description: resolved.description,
        dueDate,
        externalId,
        auditAction: 'imported',
      });
      return { kind: 'success' };
    } catch (error) {
      if (error instanceof DuplicateExternalIdError) return { kind: 'skipped' };
      return { kind: 'failed', reason: (error as Error).message };
    }
  }

  private async resolveOrCreateDiscipline(
    ctx: {
      project: { id: string };
      autoCreate: boolean;
      disciplines: { id: string; code: string; name: string }[];
    },
    raw: string,
  ) {
    const needle = raw.toLowerCase();
    const found = ctx.disciplines.find(
      (d) => d.code.toLowerCase() === needle || d.name.toLowerCase() === needle,
    );
    if (found) return found;
    if (!ctx.autoCreate) return null;

    const created = await this.prisma.discipline.create({
      data: { projectId: ctx.project.id, code: raw.toUpperCase().slice(0, 20), name: raw },
    });
    ctx.disciplines.push(created);
    return created;
  }

  private async resolveOrCreateZone(
    ctx: { project: { id: string }; autoCreate: boolean; zones: { id: string; name: string; level: string }[] },
    raw: string,
  ) {
    const needle = raw.toLowerCase();
    const found = ctx.zones.find(
      (z) => z.name.toLowerCase() === needle || `${z.level} ${z.name}`.toLowerCase() === needle,
    );
    if (found) return found;
    if (!ctx.autoCreate) return null;

    const created = await this.prisma.zone.create({
      data: { projectId: ctx.project.id, name: raw, level: '-' },
    });
    ctx.zones.push(created);
    return created;
  }

  private async resolveOrCreatePriority(
    ctx: { autoCreate: boolean; priorities: { id: string; name: string; weight: number }[] },
    raw: string,
  ) {
    const needle = raw.toLowerCase();
    const found = ctx.priorities.find((p) => p.name.toLowerCase() === needle);
    if (found) return found;
    if (!ctx.autoCreate) return null;

    // New priorities from auto-create default to the lowest urgency weight
    // so they never silently outrank an existing, deliberately configured
    // priority — an Admin can re-weight it later from /admin/master-data.
    const maxWeight = ctx.priorities.reduce((max, p) => Math.max(max, p.weight), 0);
    const created = await this.prisma.priority.create({
      data: { name: raw, weight: maxWeight + 1 },
    });
    ctx.priorities.push(created);
    return created;
  }

  private readStoredFile(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = this.storage.readStream(key);
      stream.on('data', (chunk) => chunks.push(chunk as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
