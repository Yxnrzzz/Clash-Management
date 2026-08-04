export const IMPORT_QUEUE = 'import';

export type ImportFormat = 'csv' | 'xml';

/**
 * Column-name mapping the frontend wizard collects in step 2. Values are
 * the *source column headers* the user picked for each clash field, not ids
 * — resolution against master data happens per-row in ImportProcessor.
 */
export interface ImportMapping {
  title: string;
  disciplineCode: string;
  zoneName: string;
  priorityName: string;
  description: string;
  dueDate?: string;
  externalId?: string;
}

export interface ImportJobPayload {
  jobId: string;
}

export interface RowError {
  rowNumber: number;
  reason: string;
}

/** File-extension based; content-sniffing isn't needed for the two formats this wizard accepts. */
export function detectImportFormat(fileName: string): ImportFormat {
  return fileName.toLowerCase().endsWith('.xml') ? 'xml' : 'csv';
}
