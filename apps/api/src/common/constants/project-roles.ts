import { Role } from '@prisma/client';

/** Roles that administer/oversee every project rather than just the ones
 * they hold an explicit ProjectMember row for. Engineer is the only role
 * actually confined to its assigned projects — see ProjectContextGuard and
 * ProjectsService.listAll/findCurrent. */
export const CROSS_PROJECT_ROLES: Role[] = [Role.ADMIN, Role.MANAGEMENT, Role.COORDINATOR];
