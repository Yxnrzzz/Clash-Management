import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs, ReadStream } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Local-disk implementation. Kept as a thin, single-purpose service so a
 * later swap to S3/R2 only means replacing this file — callers only ever
 * see `save()`/`readStream()`, never a filesystem path.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
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
}
