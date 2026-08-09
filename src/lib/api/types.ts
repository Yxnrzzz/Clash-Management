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
  mustChangePassword: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  code: string;
  archivedAt: string | null;
}

export interface ApiProjectStats {
  id: string;
  totalClashCount: number;
  deletedClashCount: number;
  archivedAt: string | null;
}

export interface ApiProjectMember {
  userId: string;
  name: string;
  email: string;
  projectRole: string;
  joinedAt: string;
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
  deletedAt: string | null;
  resolveProposed: string | null;
  resolveByConsultant: string | null;
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

export type ApiAttachmentRole = "ORIGINAL" | "CLASH_DETECTION" | "OTHER";

export interface ApiAttachment {
  id: string;
  clashId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
  role: ApiAttachmentRole;
}

export type ApiAnnotationKind = "RECT" | "ARROW" | "FREEHAND" | "TEXT";

export interface ApiAnnotation {
  id: string;
  attachmentId: string;
  pageNumber: number;
  authorId: string;
  kind: ApiAnnotationKind;
  geometry: Record<string, unknown>;
  color: string;
  strokeWidth: number;
  text: string | null;
  createdAt: string;
  updatedAt: string;
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

/**
 * GET /clashes/report — the consultant-format report feed. A different shape
 * from ApiClash on purpose: it carries joined names (the report prints
 * "Basement 2 Plan", not a zone id) and the two role-tagged images with
 * everything needed to render them, so the browser never has to fan out one
 * request per clash.
 */
export interface ApiReportImage {
  attachmentId: string;
  fileName: string;
  fileType: string;
  /** Signed, 15-minute TTL, no auth headers required. Prefix with /api. */
  url: string;
  expiresAt: number;
  annotations: ApiAnnotation[];
}

export interface ApiClashReportRow {
  id: string;
  uniqueCode: string;
  title: string;
  description: string;
  createdAt: string;
  closedAt: string | null;
  resolveProposed: string | null;
  resolveByConsultant: string | null;
  discipline: { id: string; code: string; name: string };
  zone: { id: string; name: string; level: string };
  status: { id: string; name: string };
  original: ApiReportImage | null;
  clashDetection: ApiReportImage | null;
}

export interface ApiClashReportResponse {
  data: ApiClashReportRow[];
  /** May exceed data.length — the server caps rows at `maxRows`. */
  total: number;
  maxRows: number;
}

export interface ApiReportCapability {
  enabled: boolean;
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
