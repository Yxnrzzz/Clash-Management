import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createReadStream, promises as fs, ReadStream } from 'fs';
import * as path from 'path';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { UPLOAD_TMP_DIR } from './upload-tmp-dir';

const DEFAULT_SIGNED_URL_TTL_MS = 5 * 60 * 1000;
const ORPHAN_TMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Local-disk implementation. Kept as a thin, single-purpose service so a
 * later swap to S3/R2 only means replacing this file — callers only ever
 * see `saveFromPath()`/`readStream()`, never a filesystem path of their own
 * choosing.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;
  private readonly urlSecret: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
    this.urlSecret = config.get<string>('ATTACHMENT_URL_SECRET') ?? 'dev-attachment-url-secret';
  }

  /**
   * Short-lived, tamper-evident access to a storage key without requiring
   * the caller to carry the API's own auth headers/cookies (useful once
   * this swaps to S3/R2 and the browser fetches bytes directly from the
   * object store rather than proxying through this API). RBAC/project
   * scoping is still checked once, up front, by whoever calls this — the
   * signature only proves "this exact key+expiry was issued by us", not
   * "the bearer is still authorized" (there's no revocation once issued).
   */
  signKey(key: string, ttlMs: number = DEFAULT_SIGNED_URL_TTL_MS): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + ttlMs;
    return { token: this.hmac(key, expiresAt), expiresAt };
  }

  verifySignedKey(key: string, token: string, expiresAt: number): boolean {
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    const expected = Buffer.from(this.hmac(key, expiresAt), 'hex');
    const actual = Buffer.from(token, 'hex');
    // timingSafeEqual throws on length mismatch rather than returning
    // false, and a malformed/short token is exactly the kind of input an
    // attacker would send — check length first instead of catching.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private hmac(key: string, expiresAt: number): string {
    return createHmac('sha256', this.urlSecret).update(`${key}|${expiresAt}`).digest('hex');
  }

  /**
   * Moves a file multer already wrote to disk (via diskStorage — see
   * upload-tmp-dir.ts) into its permanent location under UPLOAD_DIR, rather
   * than taking the whole upload as an in-memory Buffer. Attachments and
   * import files are allowed up to 10MB each, several per request — buffering
   * all of that in process memory made concurrent uploads an easy way to
   * pressure the process's RSS; staging to disk first bounds that to what
   * the OS's page cache is willing to hold.
   */
  async saveFromPath(tmpPath: string, prefix: string, originalName: string): Promise<{ key: string }> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = path.posix.join(prefix, `${randomUUID()}-${safeName}`);
    const absolutePath = path.join(this.root, key);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await fs.rename(tmpPath, absolutePath);
    } catch (error) {
      // EXDEV: tmpPath and UPLOAD_DIR live on different filesystems/volumes,
      // which rename() can't cross (e.g. UPLOAD_TMP_DIR and UPLOAD_DIR
      // pointed at separate mounted volumes) — copy then remove the
      // original as a fallback. Any other error is a real failure and
      // should propagate.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fs.copyFile(tmpPath, absolutePath);
      await fs.unlink(tmpPath);
    }

    return { key };
  }

  /**
   * `key` reaches here from two kinds of caller: server-derived (an
   * attachment row already proven to belong to the clash/project in
   * question) and, for imports, a value round-tripped through the client
   * (see CommitImportDto.token). The traversal check is the primary access
   * control for the latter, not just defence-in-depth.
   */
  readStream(key: string): ReadStream {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    if (!key) return;

    // force: true — a missing file (already deleted, or never written) is a
    // no-op, not an error. No `recursive`: if a key somehow resolved to a
    // directory, fs.rm throws here rather than wiping it.
    await fs.rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const absolute = path.resolve(this.root, key);
    // path.resolve collapses "..", so a key like "../../etc/passwd" lands
    // outside root and is rejected here rather than opened/unlinked.
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new Error('Kunci penyimpanan tidak valid.');
    }
    return absolute;
  }

  /**
   * multer's diskStorage (see upload-tmp-dir.ts) writes an upload to
   * UPLOAD_TMP_DIR before saveFromPath() moves it under UPLOAD_DIR; a
   * request that fails between those two steps (validation error, process
   * crash, client disconnect mid-upload) leaves the temp file behind
   * forever otherwise. Daily sweep, matching OverdueScannerService's cadence
   * — nothing here is time-sensitive enough to need tighter than that, and
   * a 24h grace period comfortably outlives any in-flight request.
   */
  @Cron('30 3 * * *')
  async cleanupOrphanedTempFiles(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(UPLOAD_TMP_DIR);
    } catch (error) {
      this.logger.warn(`Gagal membaca direktori sementara: ${(error as Error).message}`);
      return;
    }

    const cutoff = Date.now() - ORPHAN_TMP_FILE_MAX_AGE_MS;
    for (const entry of entries) {
      const absolute = path.join(UPLOAD_TMP_DIR, entry);
      try {
        const stat = await fs.stat(absolute);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          await fs.unlink(absolute);
        }
      } catch (error) {
        this.logger.warn(`Gagal membersihkan file sementara ${entry}: ${(error as Error).message}`);
      }
    }
  }
}
