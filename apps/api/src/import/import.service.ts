import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/auth.types';
import { CommitImportDto } from './dto/import.dto';
import { parseCsv } from './parsers/csv.parser';
import { parseXml } from './parsers/xml.parser';
import { ParsedTable } from './parsers/table';
import { detectImportFormat, IMPORT_QUEUE, ImportJobPayload, ImportMapping } from './import.types';

const MAX_PREVIEW_SAMPLE_ROWS = 20;
const STORAGE_PREFIX = 'imports';

/** needle sets used to auto-guess a column mapping from header names — moved
 * here from the old client-side wizard (src/app/import/page.tsx) so preview
 * always returns a best-effort mapping regardless of which client calls it. */
const HEADER_GUESSES: Record<keyof ImportMapping, string[]> = {
  title: ['judul', 'title'],
  disciplineCode: ['disiplin', 'discipline'],
  zoneName: ['zona', 'zone'],
  priorityName: ['prioritas', 'priority'],
  description: ['deskripsi', 'description'],
  dueDate: ['duedate', 'tanggal'],
  externalId: ['externalid', 'idsumber', 'sourceid', 'idexternal'],
};

function suggestMapping(columns: string[]): Partial<ImportMapping> {
  const guess = (needles: string[]) =>
    columns.find((col) => needles.some((needle) => col.toLowerCase().replace(/[^a-z]/g, '').includes(needle))) ??
    '';

  return {
    title: guess(HEADER_GUESSES.title),
    disciplineCode: guess(HEADER_GUESSES.disciplineCode),
    zoneName: guess(HEADER_GUESSES.zoneName),
    priorityName: guess(HEADER_GUESSES.priorityName),
    description: guess(HEADER_GUESSES.description),
    dueDate: guess(HEADER_GUESSES.dueDate),
    externalId: guess(HEADER_GUESSES.externalId),
  };
}

function parseTable(format: 'csv' | 'xml', text: string): ParsedTable {
  return format === 'xml' ? parseXml(text) : parseCsv(text);
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(IMPORT_QUEUE) private readonly queue: Queue<ImportJobPayload>,
  ) {}

  /**
   * Parses the uploaded file just enough to drive the mapping step (sample
   * rows + detected columns), then persists the raw file so commit() doesn't
   * need the client to re-upload it — `token` is the storage key.
   */
  async preview(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('File tidak ditemukan.');

    try {
      const format = detectImportFormat(file.originalname);
      const text = await fs.readFile(file.path, 'utf-8');
      const { columns, rows } = parseTable(format, text);

      if (columns.length === 0) {
        throw new BadRequestException('File tidak berisi kolom yang bisa dibaca.');
      }

      const { key } = await this.storage.saveFromPath(file.path, STORAGE_PREFIX, file.originalname);

      return {
        token: key,
        fileName: file.originalname,
        format,
        columns,
        sampleRows: rows.slice(0, MAX_PREVIEW_SAMPLE_ROWS),
        totalRows: rows.length,
        suggestedMapping: suggestMapping(columns),
      };
    } catch (error) {
      // A malformed/empty upload is a common user error, not a rare fault —
      // worth cleaning up immediately rather than leaving it for the daily
      // orphan-file sweep. saveFromPath() moves (renames) the file out of
      // its temp path on success, so by the time any error could reach
      // here the file is either still at its original temp path (safe to
      // unlink) or already gone (unlink is a harmless no-op-ish failure,
      // swallowed below).
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Creates the ImportJob row and enqueues it — does NOT wait for processing.
   * autoCreateMasterData is only honoured for Admins; a non-Admin (or a
   * request that bypasses the UI) that sets it is rejected outright rather
   * than silently downgraded, so the caller finds out immediately.
   */
  async commit(dto: CommitImportDto, user: AuthUser, projectId: string) {
    if (dto.autoCreateMasterData && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Hanya Admin yang dapat mengaktifkan pembuatan master data otomatis saat impor.',
      );
    }

    const format = detectImportFormat(dto.token);
    const buffer = await this.readStoredFile(dto.token);
    const { rows } = parseTable(format, buffer.toString('utf-8'));

    if (rows.length === 0) {
      throw new BadRequestException('File tidak memiliki baris data untuk diimpor.');
    }

    const job = await this.prisma.importJob.create({
      data: {
        projectId,
        createdById: user.id,
        fileName: dto.fileName,
        storageKey: dto.token,
        format,
        mapping: dto.mapping as unknown as Prisma.InputJsonValue,
        autoCreate: Boolean(dto.autoCreateMasterData),
        totalRows: rows.length,
      },
    });

    await this.queue.add('process', { jobId: job.id });

    return { jobId: job.id };
  }

  /** Scoped to the job's creator or an Admin — an import job can carry a raw
   * file name / row errors that other Coordinators shouldn't be able to poll. */
  async getJob(id: string, user: AuthUser) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job impor tidak ditemukan.');
    if (job.createdById !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Anda tidak berhak melihat job impor ini.');
    }
    return job;
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
