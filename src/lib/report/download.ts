/**
 * Menyerahkan workbook yang sudah jadi ke pengguna.
 *
 * ExcelJS di browser tidak punya padanan `writeFile()` seperti SheetJS
 * (lihat XLSX.writeFile di src/lib/export.ts) — hanya writeBuffer(), jadi
 * langkah Blob + anchor ini dikerjakan sendiri.
 */

import type ExcelJSNamespace from "exceljs";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadWorkbook(
  workbook: ExcelJSNamespace.Workbook,
  filename: string
): Promise<number> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
  return blob.size;
}

/** `laporan-clash-JTB-2026-08-09.xlsx` */
export function reportFilename(projectCode: string, now: Date = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const safeCode = projectCode.replace(/[^A-Za-z0-9_-]/g, "") || "proyek";
  return `laporan-clash-${safeCode}-${stamp}.xlsx`;
}
