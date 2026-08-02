/**
 * Raw shapes returned by the NestJS API. These deliberately use the backend's
 * English field names (mirroring the Prisma schema); everything the UI touches
 * goes through mappers.ts and comes out in the Indonesian domain types declared
 * in src/lib/types.ts.
 */

export type ApiRole = "ENGINEER" | "COORDINATOR" | "MANAGEMENT" | "ADMIN";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiRole;
  isActive: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  code: string;
}

export interface ApiDiscipline {
  id: string;
  projectId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ApiZone {
  id: string;
  projectId: string;
  name: string;
  level: string;
  isActive: boolean;
}

export interface ApiStatus {
  id: string;
  name: string;
  sequence: number;
  isClosedState: boolean;
}

export interface ApiPriority {
  id: string;
  name: string;
  weight: number;
  isActive: boolean;
}

export interface ApiSession {
  accessToken: string;
  user: ApiUser;
}

export interface ApiClash {
  id: string;
  uniqueCode: string;
  projectId: string;
  title: string;
  description: string;
  disciplineId: string;
  zoneId: string;
  statusId: string;
  priorityId: string;
  reporterId: string;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface ApiComment {
  id: string;
  clashId: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export interface ApiAuditLog {
  id: string;
  clashId: string;
  actorId: string;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
}

export interface ApiClashDetail extends ApiClash {
  comments: ApiComment[];
  auditLogs: ApiAuditLog[];
}
