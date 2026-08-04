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

export interface ApiAttachment {
  id: string;
  clashId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
}

export interface ApiClashDetail extends ApiClash {
  comments: ApiComment[];
  auditLogs: ApiAuditLog[];
  attachments: ApiAttachment[];
}

export interface ApiClashListResponse {
  data: ApiClash[];
  total: number;
}

export interface ApiNotificationPreference {
  userId: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
}

export interface ApiSlice {
  id: string;
  label: string;
  value: number;
}

export interface ApiTrendPoint {
  weekStart: string;
  createdCount: number;
  closedCount: number;
}

export interface ApiDashboardMetrics {
  totalClash: number;
  openCount: number;
  closedCount: number;
  overdueCount: number;
  mttrDays: number | null;
  trend: ApiTrendPoint[];
  byDiscipline: ApiSlice[];
  byPriority: ApiSlice[];
  byZone: ApiSlice[];
}

export type ApiImportFormat = "csv" | "xml";

/** Values are source column headers picked in the wizard, not master-data ids. */
export interface ApiImportMapping {
  title: string;
  disciplineCode: string;
  zoneName: string;
  priorityName: string;
  description: string;
  dueDate?: string;
  externalId?: string;
}

export interface ApiImportPreview {
  token: string;
  fileName: string;
  format: ApiImportFormat;
  columns: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedMapping: Partial<ApiImportMapping>;
}

export type ApiImportJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export interface ApiImportRowError {
  rowNumber: number;
  reason: string;
}

export interface ApiImportJob {
  id: string;
  fileName: string;
  format: ApiImportFormat;
  status: ApiImportJobStatus;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  skippedRows: number;
  errors: ApiImportRowError[];
  createdAt: string;
  finishedAt: string | null;
}

export interface ApiCopyTemplateResult {
  copied: { disciplines: number; zones: number };
  skipped: { disciplines: number; zones: number };
}
