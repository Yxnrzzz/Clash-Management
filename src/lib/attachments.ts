/**
 * Shared with clashes/new/page.tsx's staged-file dropzone — kept as plain
 * constants/functions (not a component) since the two upload flows have
 * different lifecycles: new/page.tsx stages files before the clash exists,
 * while the detail page's AttachmentPanel uploads immediately to an
 * existing clash.
 */
export const MAX_FILE_MB = 10;
export const MAX_FILES = 10;
export const ACCEPTED_TYPES = ["image/", "application/pdf"];

export function validateAttachmentFile(file: File): string | undefined {
  const typeOk = ACCEPTED_TYPES.some((t) => file.type.startsWith(t));
  if (!typeOk) return "Tipe file harus gambar atau PDF";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Ukuran melebihi ${MAX_FILE_MB} MB`;
  return undefined;
}
