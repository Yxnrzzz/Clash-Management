import { mkdirSync } from 'fs';
import * as path from 'path';

/**
 * Where multer's diskStorage stages uploaded files before StorageService
 * moves them under UPLOAD_DIR (see clashes.controller.ts, import.controller.ts,
 * StorageService.saveFromPath). Read directly from process.env rather than
 * ConfigService: a diskStorage destination is a decorator argument, which
 * NestJS evaluates at module-load time — before the DI container (and
 * therefore ConfigService) exists. Mirrors main.ts's direct read of
 * process.env.SENTRY_DSN for the same reason.
 */
export const UPLOAD_TMP_DIR = path.resolve(process.env.UPLOAD_TMP_DIR ?? './uploads/tmp');

// multer errors if the destination directory doesn't already exist —
// created once, synchronously, the first time this module loads (i.e.
// before any request can reach an interceptor that uses it).
mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
