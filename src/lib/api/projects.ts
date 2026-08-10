import { apiDelete, apiGet, apiPost } from "./client";
import type { ApiProject, ApiProjectMember, ApiProjectStats } from "./types";

/** Admin-only when includeArchived is set — see ProjectsService.listAll. */
export function listProjects(opts?: { includeArchived?: boolean }): Promise<ApiProject[]> {
  return apiGet<ApiProject[]>(`/projects${opts?.includeArchived ? "?includeArchived=1" : ""}`);
}

/** Admin-only — backs the rename-confirmation dialog and the "hapus
 * permanen" button's enabled state (only when totalClashCount === 0). */
export function getProjectStats(projectId: string): Promise<ApiProjectStats> {
  return apiGet<ApiProjectStats>(`/projects/${projectId}/stats`);
}

/** Admin-only — see ProjectsController's :projectId/members routes. */
export function listProjectMembers(projectId: string): Promise<ApiProjectMember[]> {
  return apiGet<ApiProjectMember[]>(`/projects/${projectId}/members`);
}

export function addProjectMember(
  projectId: string,
  payload: { userId: string; projectRole: string }
): Promise<ApiProjectMember[]> {
  return apiPost<ApiProjectMember[]>(`/projects/${projectId}/members`, payload);
}

export function removeProjectMember(projectId: string, userId: string): Promise<ApiProjectMember[]> {
  return apiDelete<ApiProjectMember[]>(`/projects/${projectId}/members/${userId}`);
}
