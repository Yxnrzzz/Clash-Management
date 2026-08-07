import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs, ReadStream } from 'fs';
import * as path from 'path';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const DEFAULT_SIGNED_URL_TTL_MS = 5 * 60 * 1000;

/**
 * Local-disk implementation. Kept as a thin, single-purpose service so a
 * later swap to S3/R2 only means replacing this file — callers only ever
 * see `save()`/`readStream()`, never a filesystem path.
 */
@Injectable()
export class StorageService {
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

  async save(buffer: Buffer, clashId: string, originalName: string): Promise<{ key: string }> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = path.posix.join(clashId, `${randomUUID()}-${safeName}`);
    const absolutePath = path.join(this.root, key);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    return { key };
  }

  readStream(key: string): ReadStream {
    return createReadStream(path.join(this.root, key));
  }

  /**
   * The key is never client-supplied — the only caller passes
   * attachment.fileUrl, read from a row that the service layer already
   * proved belongs to the clash/project in question. The traversal check
   * below is defence-in-depth against a corrupted DB row, not the primary
   * access control.
   */
  async delete(key: string): Promise<void> {
    if (!key) return;

    const absolute = path.resolve(this.root, key);
    // path.resolve collapses "..", so a key like "../../etc/passwd" lands
    // outside root and is rejected here rather than unlinked.
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new Error('Kunci penyimpanan tidak valid.');
    }

    // force: true — a missing file (already deleted, or never written) is a
    // no-op, not an error. No `recursive`: if a key somehow resolved to a
    // directory, fs.rm throws here rather than wiping it.
    await fs.rm(absolute, { force: true });
  }
}
