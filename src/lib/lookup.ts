import { DISCIPLINES, PRIORITIES, STATUSES, USERS, ZONES } from "./mock-data";
import type { Clash, Role } from "./types";

export function disciplineById(id: string) {
  return DISCIPLINES.find((d) => d.id === id);
}
export function zoneById(id: string) {
  return ZONES.find((z) => z.id === id);
}
export function statusById(id: string) {
  return STATUSES.find((s) => s.id === id);
}
export function priorityById(id: string) {
  return PRIORITIES.find((p) => p.id === id);
}
export function userById(id: string | null) {
  if (!id) return undefined;
  return USERS.find((u) => u.id === id);
}

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

export function isOverdue(clash: Clash) {
  const status = statusById(clash.statusId);
  if (!clash.dueDate || status?.isClosedState) return false;
  return new Date(clash.dueDate).getTime() < Date.now();
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_ORDER = ["Open", "In Progress", "Resolved", "Closed"] as const;

export function canEditClash(role: Role, clash: Clash, userId: string) {
  if (role === "Coordinator" || role === "Admin") return true;
  if (role === "Engineer") return clash.assigneeId === userId || clash.reporterId === userId;
  return false;
}

export function allowedStatusTransitions(role: Role, clash: Clash, userId: string): string[] {
  const current = statusById(clash.statusId);
  if (!current) return [];
  if (role === "Coordinator" || role === "Admin") {
    return STATUSES.map((s) => s.id).filter((id) => id !== current.id);
  }
  if (role === "Engineer" && clash.assigneeId === userId) {
    // Engineer terbatas: Open -> In Progress -> Resolved (tidak boleh menutup atau mundur)
    const forwardOnly = STATUSES.filter(
      (s) => s.urutan === current.urutan + 1 && s.nama !== "Closed"
    );
    return forwardOnly.map((s) => s.id);
  }
  return [];
}

export function canComment(role: Role) {
  return role !== "Management";
}
