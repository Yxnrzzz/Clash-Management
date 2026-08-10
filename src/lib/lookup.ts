import type { AttachmentRole, Clash, Role, Status, User } from "./types";

export function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function canEditClash(role: Role, clash: Clash, userId: string) {
  if (role === "Coordinator" || role === "Admin") return true;
  if (role === "Engineer") return clash.assigneeId === userId || clash.reporterId === userId;
  return false;
}

export function isAdmin(role: Role) {
  return role === "Admin";
}

export function canDeleteClash(role: Role) {
  return role === "Admin";
}

/** Any role that can write may attach files to any clash in their project —
 * unlike editing the clash's own fields, this isn't restricted to the
 * assignee/reporter. Management stays read-only. */
export function canUploadAttachment(role: Role) {
  return role === "Engineer" || role === "Coordinator" || role === "Admin";
}

/** Engineer may delete only their own upload; Coordinator/Admin may delete
 * anyone's. Keyed on the uploader, not assignee/reporter — a distinct rule
 * from canEditClash(). */
export function canDeleteAttachment(role: Role, uploadedById: string, userId: string) {
  if (role === "Coordinator" || role === "Admin") return true;
  if (role === "Engineer") return uploadedById === userId;
  return false;
}

/** Tagging which report column an attachment feeds decides what a consultant
 * sees in the finished document, so it carries exactly the same rule as
 * deleting one — mirrors assertCanManageAttachment() on the server. */
export function canManageAttachment(role: Role, uploadedById: string, userId: string) {
  return canDeleteAttachment(role, uploadedById, userId);
}

/** Label kolom laporan untuk sebuah peran lampiran. */
export const ATTACHMENT_ROLE_LABEL: Record<AttachmentRole, string> = {
  ORIGINAL: "Original",
  CLASH_DETECTION: "Clash Detection",
  OTHER: "Lainnya",
};

/** Markup is shared but only writable by roles that can already write
 * elsewhere — Management stays read-only, same as attachments/comments. */
export function canDrawAnnotation(role: Role) {
  return role === "Engineer" || role === "Coordinator" || role === "Admin";
}

/** Author may edit/delete their own markup; Coordinator/Admin may edit/
 * delete anyone's — mirrors canDeleteAttachment's shape. */
export function canEditAnnotation(role: Role, authorId: string, userId: string) {
  if (role === "Coordinator" || role === "Admin") return true;
  if (role === "Engineer") return authorId === userId;
  return false;
}

export function isAssignable(user: User) {
  return user.isActive && user.peran === "Engineer";
}

/**
 * Coordinator/Admin may move to any other status. An Engineer may only
 * move their own assigned item forward one step, and never into a
 * closed-state status — this checks `isClosedState`, not the status
 * name, so renaming "Closed" from the Admin master-data page can't
 * silently let an Engineer close an item.
 */
export function allowedStatusTransitions(
  statuses: Status[],
  role: Role,
  clash: Clash,
  userId: string,
): string[] {
  const current = statuses.find((s) => s.id === clash.statusId);
  if (!current) return [];
  if (role === "Coordinator" || role === "Admin") {
    return statuses.map((s) => s.id).filter((id) => id !== current.id);
  }
  if (role === "Engineer" && clash.assigneeId === userId) {
    return statuses
      .filter((s) => s.urutan === current.urutan + 1 && !s.isClosedState)
      .map((s) => s.id);
  }
  return [];
}
