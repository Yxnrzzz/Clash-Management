import type { Clash, Role, Status, User } from "./types";

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

export function canComment(role: Role) {
  return role !== "Management";
}

export function isAdmin(role: Role) {
  return role === "Admin";
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
