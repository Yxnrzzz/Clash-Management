import type {
  Attachment,
  AuditLogEntry,
  Clash,
  Comment,
  Discipline,
  NewClashInput,
  NotificationPreference,
  Priority,
  Project,
  Role,
  Status,
  User,
  Zone,
} from "../types";
import { WEEK_LABEL, type DashboardMetrics } from "../dashboard-metrics";
import type { Annotation, Geometry } from "../annotations";
import type {
  ApiAnnotation,
  ApiAttachment,
  ApiAuditLog,
  ApiClash,
  ApiComment,
  ApiDashboardMetrics,
  ApiDiscipline,
  ApiNotificationPreference,
  ApiPriority,
  ApiProject,
  ApiRole,
  ApiStatus,
  ApiUser,
  ApiZone,
} from "./types";

/**
 * The one place the API's English vocabulary is translated into the Indonesian
 * domain types the UI is written against. Keeping the translation here means
 * src/lib/types.ts and every component stay untouched by the backend switch.
 */

const ROLE_FROM_API: Record<ApiRole, Role> = {
  ENGINEER: "Engineer",
  COORDINATOR: "Coordinator",
  MANAGEMENT: "Management",
  ADMIN: "Admin",
};

const ROLE_TO_API: Record<Role, ApiRole> = {
  Engineer: "ENGINEER",
  Coordinator: "COORDINATOR",
  Management: "MANAGEMENT",
  Admin: "ADMIN",
};

export const toRole = (role: ApiRole): Role => ROLE_FROM_API[role];
export const fromRole = (peran: Role): ApiRole => ROLE_TO_API[peran];

export const toUser = (u: ApiUser): User => ({
  id: u.id,
  nama: u.name,
  email: u.email,
  peran: toRole(u.role),
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
});

export const toProject = (p: ApiProject): Project => ({
  id: p.id,
  nama: p.name,
  kode: p.code,
  archivedAt: p.archivedAt,
});

export const toDiscipline = (d: ApiDiscipline): Discipline => ({
  id: d.id,
  kode: d.code,
  nama: d.name,
  isActive: d.isActive,
});

export const toZone = (z: ApiZone): Zone => ({
  id: z.id,
  nama: z.name,
  level: z.level,
  isActive: z.isActive,
});

export const toStatus = (s: ApiStatus): Status => ({
  id: s.id,
  nama: s.name,
  urutan: s.sequence,
  isClosedState: s.isClosedState,
});

export const toPriority = (p: ApiPriority): Priority => ({
  id: p.id,
  nama: p.name,
  bobot: p.weight,
  isActive: p.isActive,
});

// --- Request payloads (Indonesian form fields → English API fields) ---------

export const userPayload = (input: Partial<Pick<User, "nama" | "email" | "peran">>) => ({
  ...(input.nama !== undefined ? { name: input.nama } : {}),
  ...(input.email !== undefined ? { email: input.email } : {}),
  ...(input.peran !== undefined ? { role: fromRole(input.peran) } : {}),
});

export const projectPayload = (input: Partial<Pick<Project, "nama" | "kode">>) => ({
  ...(input.nama !== undefined ? { name: input.nama } : {}),
  ...(input.kode !== undefined ? { code: input.kode } : {}),
});

export const disciplinePayload = (input: Partial<Pick<Discipline, "kode" | "nama">>) => ({
  ...(input.kode !== undefined ? { code: input.kode } : {}),
  ...(input.nama !== undefined ? { name: input.nama } : {}),
});

export const zonePayload = (input: Partial<Pick<Zone, "nama" | "level">>) => ({
  ...(input.nama !== undefined ? { name: input.nama } : {}),
  ...(input.level !== undefined ? { level: input.level } : {}),
});

export const priorityPayload = (input: Partial<Pick<Priority, "nama" | "bobot">>) => ({
  ...(input.nama !== undefined ? { name: input.nama } : {}),
  ...(input.bobot !== undefined ? { weight: input.bobot } : {}),
});

export const statusPayload = (input: Partial<Pick<Status, "nama" | "isClosedState">>) => ({
  ...(input.nama !== undefined ? { name: input.nama } : {}),
  ...(input.isClosedState !== undefined ? { isClosedState: input.isClosedState } : {}),
});

// --- Clashes, comments, audit log --------------------------------------------

export const toClash = (c: ApiClash): Clash => ({
  id: c.id,
  kodeUnik: c.uniqueCode,
  projectId: c.projectId,
  judul: c.title,
  deskripsi: c.description,
  disciplineId: c.disciplineId,
  zoneId: c.zoneId,
  statusId: c.statusId,
  priorityId: c.priorityId,
  reporterId: c.reporterId,
  assigneeId: c.assigneeId,
  dueDate: c.dueDate,
  createdAt: c.createdAt,
  closedAt: c.closedAt,
  deletedAt: c.deletedAt,
});

export const toComment = (c: ApiComment): Comment => ({
  id: c.id,
  clashId: c.clashId,
  authorId: c.authorId,
  isi: c.content,
  createdAt: c.createdAt,
});

export const toAuditLog = (a: ApiAuditLog): AuditLogEntry => ({
  id: a.id,
  clashId: a.clashId,
  actorId: a.actorId,
  aksi: a.action,
  field: a.field ?? undefined,
  nilaiLama: a.oldValue ?? undefined,
  nilaiBaru: a.newValue ?? undefined,
  createdAt: a.createdAt,
});

export const toAttachment = (a: ApiAttachment): Attachment => ({
  id: a.id,
  clashId: a.clashId,
  namaFile: a.fileName,
  tipe: a.fileType.startsWith("image/") ? "image" : a.fileType === "application/pdf" ? "pdf" : "other",
  ukuranBytes: a.sizeBytes,
  uploadedBy: a.uploadedById,
  createdAt: a.createdAt,
});

export const toAnnotation = (a: ApiAnnotation): Annotation => ({
  id: a.id,
  attachmentId: a.attachmentId,
  pageNumber: a.pageNumber,
  authorId: a.authorId,
  kind: a.kind,
  geometry: a.geometry as unknown as Geometry,
  color: a.color,
  strokeWidth: a.strokeWidth,
  text: a.text,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

/** Request payload for POST/PATCH .../annotations — geometry is sent as-is
 * (already normalized [0,1] by the caller). */
export const annotationPayload = (input: {
  kind?: Annotation["kind"];
  pageNumber?: number;
  geometry?: Geometry;
  color?: string;
  strokeWidth?: number;
  text?: string;
}) => ({
  ...(input.kind !== undefined ? { kind: input.kind } : {}),
  ...(input.pageNumber !== undefined ? { pageNumber: input.pageNumber } : {}),
  ...(input.geometry !== undefined ? { geometry: input.geometry } : {}),
  ...(input.color !== undefined ? { color: input.color } : {}),
  ...(input.strokeWidth !== undefined ? { strokeWidth: input.strokeWidth } : {}),
  ...(input.text !== undefined ? { text: input.text } : {}),
});

export const newClashPayload = (input: Omit<NewClashInput, "attachments">) => ({
  title: input.judul,
  description: input.deskripsi,
  disciplineId: input.disciplineId,
  zoneId: input.zoneId,
  priorityId: input.priorityId,
  ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
});

export type ClashFieldPatch = Partial<{
  statusId: string;
  priorityId: string;
  assigneeId: string | null;
  dueDate: string | null;
}>;

// --- Notification preference ----------------------------------------------

export const toNotificationPreference = (p: ApiNotificationPreference): NotificationPreference => ({
  userId: p.userId,
  emailEnabled: p.emailEnabled,
  whatsappEnabled: p.whatsappEnabled,
  whatsappNumber: p.whatsappNumber,
});

export const notificationPreferencePayload = (
  input: Partial<Omit<NotificationPreference, "userId">>
) => ({
  ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
  ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
  ...(input.whatsappNumber !== undefined ? { whatsappNumber: input.whatsappNumber } : {}),
});

// --- Dashboard metrics ---------------------------------------------------

export const toDashboardMetrics = (m: ApiDashboardMetrics): DashboardMetrics => ({
  totalClash: m.totalClash,
  openCount: m.openCount,
  closedCount: m.closedCount,
  overdueCount: m.overdueCount,
  mttrDays: m.mttrDays,
  trend: m.trend.map((t) => ({
    weekStart: t.weekStart,
    label: WEEK_LABEL.format(new Date(t.weekStart)),
    dibuat: t.createdCount,
    ditutup: t.closedCount,
  })),
  byDiscipline: m.byDiscipline,
  byPriority: m.byPriority,
  byZone: m.byZone,
});
