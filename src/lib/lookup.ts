import type { Clash, Role } from "./types";

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
