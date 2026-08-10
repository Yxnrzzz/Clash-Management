import { Prisma } from '@prisma/client';

/**
 * Shared where-fragment excluding soft-deleted clashes. Kept in its own
 * file (not inside ClashesService) so other modules — ImportProcessor,
 * OverdueScannerService, NotificationsProcessor — can import it without a
 * circular dependency on ClashesModule. Spread into every query that reads
 * clashes; see ClashesService for the full inventory of call sites and the
 * two intentional exceptions (uniqueCode sequence count, import dedupe).
 */
export const NOT_DELETED = { deletedAt: null } satisfies Prisma.ClashWhereInput;
