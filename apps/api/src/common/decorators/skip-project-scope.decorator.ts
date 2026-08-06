import { SetMetadata } from '@nestjs/common';

export const SKIP_PROJECT_SCOPE_KEY = 'skipProjectScope';

/**
 * Opts a route out of ProjectContextGuard's mandatory X-Project-Id check.
 * Use only for routes whose data is intentionally global or cross-project
 * (e.g. user management, the projects list itself, global master data).
 */
export const SkipProjectScope = () => SetMetadata(SKIP_PROJECT_SCOPE_KEY, true);
