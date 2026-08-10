/**
 * Semua angka ajaib laporan "Tabel Clash Detection" ada di sini, dan tidak
 * ada DOM sama sekali — supaya matematikanya bisa diuji tanpa membangun
 * workbook, dan supaya kalau laporan ini suatu saat perlu dibuat di server,
 * hanya lapisan pengambilan gambar yang perlu kembaran.
 *
 * Lebar kolom dan lebar piksel berasal dari SATU tabel: kalau keduanya
 * didefinisikan terpisah, matematika aspect-fit dan sheet-nya akan diam-diam
 * berbeda dan gambar meleset dari selnya.
 */

import type { ApiClashReportRow } from "../api/types";

export interface ReportColumn {
  key: string;
  /** Header persis seperti yang dicetak konsultan. */
  label: string;
  /** Satuan "karakter" Excel. */
  width: number;
}

export const COLUMNS: ReportColumn[] = [
  { key: "no", label: "No.", width: 5 },
  { key: "original", label: "Original", width: 34 },
  { key: "discipline", label: "Discipline", width: 14 },
  { key: "notes", label: "Notes / Location", width: 30 },
  { key: "clashDetection", label: "Clash Detection", width: 34 },
  { key: "identifiedDate", label: "Clash Indentified Date", width: 14 },
  { key: "resolveProposed", label: "Resolve (TATA Proposed)", width: 28 },
  { key: "resolveByConsultant", label: "Resolve by Consultant", width: 28 },
  { key: "resolveDate", label: "Resolve Date", width: 14 },
];

/** Indeks 1-based, sesuai konvensi ExcelJS. */
export const COL = {
  no: 1,
  original: 2,
  discipline: 3,
  notes: 4,
  clashDetection: 5,
  identifiedDate: 6,
  resolveProposed: 7,
  resolveByConsultant: 8,
  resolveDate: 9,
} as const;

export const COLUMN_COUNT = COLUMNS.length;

/** Tinggi baris data dalam piksel — cukup untuk gambar tetap terbaca saat
 * dicetak, tanpa membuat satu baris memakan setengah halaman. */
export const DATA_ROW_HEIGHT_PX = 150;

/** Lebar kolom Excel ("karakter") → piksel, metrik Calibri 11. */
export function columnWidthToPx(width: number): number {
  return Math.round(width * 7) + 5;
}

/** Tinggi baris Excel dinyatakan dalam POINT, bukan piksel. */
export function pxToPoints(px: number): number {
  return px * 0.75;
}

export interface FitResult {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Menempatkan gambar berukuran natW x natH di dalam kotak sel, terpusat,
 * mempertahankan rasio aspek.
 *
 * Tidak pernah MEMPERBESAR (skala dibatasi 1): sebuah thumbnail 80px yang
 * diregangkan ke lebar sel akan terlihat rusak di dokumen cetak, dan lebih
 * baik kecil-tajam daripada besar-buram.
 *
 * `pad` bukan sekadar estetika: anchor ExcelJS berupa pecahan dari ukuran
 * sel, dan pembulatannya bisa menggeser gambar beberapa piksel — tanpa
 * bantalan, gambar selebar sel bisa tumpah ke kolom sebelah.
 */
export function fitImage(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  pad = 4
): FitResult {
  const availableWidth = Math.max(1, boxWidth - pad * 2);
  const availableHeight = Math.max(1, boxHeight - pad * 2);

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: 0, height: 0, offsetX: pad, offsetY: pad };
  }

  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  return {
    width,
    height,
    offsetX: Math.round((boxWidth - width) / 2),
    offsetY: Math.round((boxHeight - height) / 2),
  };
}

/** Label grup untuk baris tanpa lantai. Diurut paling akhir. */
export const NO_FLOOR_LABEL = "Tanpa Lantai";

export interface FloorGroup {
  level: string;
  rows: ApiClashReportRow[];
}

/**
 * Mengelompokkan baris per lantai untuk band "Floor: …".
 *
 * Kuncinya diambil dari `row.zone.level` di payload, BUKAN dari lookup
 * master-data: export tidak boleh bergantung pada apakah master-data sudah
 * selesai dimuat di context, dan payload laporan sudah membawa nama
 * ter-join justru untuk alasan ini.
 *
 * `zoneOrder` — daftar level sesuai urutan master zones — memberi Admin
 * kendali urutan lantai tanpa UI baru: cukup atur urutan zona. Level yang
 * tidak ada di situ jatuh ke urutan alami (numeric collator, jadi "Lantai 2"
 * mendahului "Lantai 10").
 */
export function groupByFloor(
  rows: ApiClashReportRow[],
  zoneOrder: string[] = []
): FloorGroup[] {
  const groups = new Map<string, ApiClashReportRow[]>();
  for (const row of rows) {
    const level = row.zone?.level?.trim() || NO_FLOOR_LABEL;
    const list = groups.get(level);
    if (list) list.push(row);
    else groups.set(level, [row]);
  }

  const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
  const rank = new Map<string, number>();
  zoneOrder.forEach((level, i) => {
    const key = level?.trim();
    if (key && !rank.has(key)) rank.set(key, i);
  });

  return [...groups.entries()]
    .map(([level, groupRows]) => ({ level, rows: groupRows }))
    .sort((a, b) => {
      // "Tanpa Lantai" selalu terakhir: itu keranjang sisa, bukan lantai.
      if (a.level === NO_FLOOR_LABEL) return b.level === NO_FLOOR_LABEL ? 0 : 1;
      if (b.level === NO_FLOOR_LABEL) return -1;

      const ra = rank.get(a.level);
      const rb = rank.get(b.level);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return collator.compare(a.level, b.level);
    });
}

/**
 * Label bulan di bawah judul, mis. "Agustus-2026".
 *
 * Kalau filter rentang tanggal Register jatuh di bulan yang sama, itulah
 * bulan laporannya — pengguna yang memfilter Agustus mengharapkan laporan
 * Agustus meskipun mengeksporya di September. Kalau tidak (lintas bulan,
 * atau tanpa filter), pakai tanggal hari ini.
 */
export function monthLabel(
  createdFrom?: string | null,
  createdTo?: string | null,
  now: Date = new Date()
): string {
  let target = now;

  if (createdFrom && createdTo) {
    const from = new Date(createdFrom);
    const to = new Date(createdTo);
    if (
      !Number.isNaN(from.getTime()) &&
      !Number.isNaN(to.getTime()) &&
      from.getFullYear() === to.getFullYear() &&
      from.getMonth() === to.getMonth()
    ) {
      target = from;
    }
  } else if (createdFrom || createdTo) {
    const only = new Date((createdFrom ?? createdTo) as string);
    if (!Number.isNaN(only.getTime())) target = only;
  }

  const month = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(target);
  return `${month}-${target.getFullYear()}`;
}

/** Batas potong teks bebas. Sel Excel dengan tinggi baris tetap memotong
 * diam-diam jauh sebelum ini — lebih baik elipsis yang terlihat daripada
 * kalimat yang hilang tanpa jejak. */
export const TEXT_CELL_MAX = 900;

export function truncateCell(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed.length > TEXT_CELL_MAX ? `${trimmed.slice(0, TEXT_CELL_MAX)}…` : trimmed;
}

/** Kolom "Notes / Location" menggabungkan judul, deskripsi, dan zona —
 * di laporan konsultan ketiganya satu sel naratif. */
export function notesCell(row: ApiClashReportRow): string {
  const zone = row.zone?.name?.trim();
  const parts = [row.title?.trim(), row.description?.trim(), zone ? `Zona: ${zone}` : ""];
  return truncateCell(parts.filter(Boolean).join("\n"));
}
