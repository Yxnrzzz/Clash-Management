import { apiGet, apiPost, apiUpload } from "./client";
import type {
  ApiCopyTemplateResult,
  ApiImportJob,
  ApiImportMapping,
  ApiImportPreview,
  ApiProject,
} from "./types";

export function previewImport(file: File): Promise<ApiImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<ApiImportPreview>("/import/preview", formData);
}

export function commitImport(payload: {
  token: string;
  fileName: string;
  mapping: ApiImportMapping;
  autoCreateMasterData?: boolean;
}): Promise<{ jobId: string }> {
  return apiPost<{ jobId: string }>("/import/commit", payload);
}

export function getImportJob(jobId: string): Promise<ApiImportJob> {
  return apiGet<ApiImportJob>(`/import/jobs/${jobId}`);
}

/** Admin-only — used by the master-data "copy template" dialog. */
export function listProjects(): Promise<ApiProject[]> {
  return apiGet<ApiProject[]>("/projects");
}

export function copyMasterDataTemplate(payload: {
  fromProjectId: string;
  toProjectId: string;
  include: ("disciplines" | "zones")[];
}): Promise<ApiCopyTemplateResult> {
  return apiPost<ApiCopyTemplateResult>("/master-data/templates/copy", payload);
}
