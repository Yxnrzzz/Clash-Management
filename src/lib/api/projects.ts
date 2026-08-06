import { apiDelete, apiGet, apiPost } from "./client";
import type { ApiProjectMember } from "./types";

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
