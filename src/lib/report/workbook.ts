/**
 * Menyusun workbook "Tabel Clash Detection".
 *
 * Tanpa DOM: menerima gambar yang SUDAH diratakan (lihat images.ts) sebagai
 * data URI, bukan URL atau canvas. Jadi seluruh tata letak bisa diuji di
 * jsdom, dan kalau laporan ini suatu saat dibuat di server, hanya lapisan
 * pengambilan gambar yang perlu diganti.
 *
 * ExcelJS di-import dinamis oleh pemanggil (~280 KB gz) — modul ini menerima
 * namespace-nya sebagai argumen daripada meng-import statis, supaya tidak
 * ada yang tidak sengaja menariknya ke bundle awal.
 */

import type ExcelJSNamespace from "exceljs";
import type { ApiClashReportRow } from "../api/types";
import { formatDate } from "../lookup";
import {
  COL,
  COLUMNS,
  COLUMN_COUNT,
  DATA_ROW_HEIGHT_PX,
  columnWidthToPx,
  fitImage,
  groupByFloor,
  notesCell,
  pxToPoints,
  truncateCell,
} from "./layout";

export interface EmbeddedImage {
  dataUrl: string;
  extension: "png" | "jpeg";
  width: number;
  height: number;
}

export interface BuildOptions {
  projectName: string;
  monthLabel: string;
  /** Urutan level dari master zones — lihat groupByFloor. */
  zoneOrder?: string[];
}

const HEADER_ROW = 3;
const THIN_BORDER = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
const BORDER_ALL = {
  top: THIN_BORDER,
  left: THIN_BORDER,
  bottom: THIN_BORDER,
  right: THIN_BORDER,
};

/**
 * Border harus dipasang ke SETIAP sel penyusun rentang merge — sel gabungan
 * mengambil nilainya dari kiri-atas, tapi bordernya tidak ikut menyebar.
 * Tanpa ini, baris judul dan band lantai tampak sebagai lubang di grid.
 */
function borderMergedRow(worksheet: ExcelJSNamespace.Worksheet, rowNumber: number) {
  for (let c = 1; c <= COLUMN_COUNT; c++) {
    worksheet.getCell(rowNumber, c).border = BORDER_ALL;
  }
}

export function buildClashReportWorkbook(
  ExcelJS: typeof ExcelJSNamespace,
  rows: ApiClashReportRow[],
  images: Map<string, EmbeddedImage>,
  options: BuildOptions
): ExcelJSNamespace.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const ws = workbook.addWorksheet("Clash Detection");

  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  // Baris 1 — judul.
  ws.mergeCells(1, 1, 1, COLUMN_COUNT);
  const title = ws.getCell(1, 1);
  title.value = `Tabel Clash Detection - Proyek ${options.projectName}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = pxToPoints(34);
  borderMergedRow(ws, 1);

  // Baris 2 — label bulan.
  ws.mergeCells(2, 1, 2, COLUMN_COUNT);
  const month = ws.getCell(2, 1);
  month.value = options.monthLabel;
  month.font = { bold: true, size: 11 };
  month.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = pxToPoints(24);
  borderMergedRow(ws, 2);

  // Baris 3 — header.
  const header = ws.getRow(HEADER_ROW);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.border = BORDER_ALL;
  });
  header.height = pxToPoints(44);

  // Header tetap terlihat saat menggulir register yang panjang.
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  const groups = groupByFloor(rows, options.zoneOrder);
  let rowNumber = HEADER_ROW;
  // Penomoran berjalan 1..N di SELURUH sheet, tidak me-reset per lantai —
  // sesuai contoh konsultan.
  let no = 0;

  for (const group of groups) {
    rowNumber += 1;
    ws.mergeCells(rowNumber, 1, rowNumber, COLUMN_COUNT);
    const band = ws.getCell(rowNumber, 1);
    band.value = `Floor: ${group.level}`;
    band.font = { bold: true, size: 10 };
    band.alignment = { horizontal: "left", vertical: "middle" };
    band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    ws.getRow(rowNumber).height = pxToPoints(22);
    borderMergedRow(ws, rowNumber);

    for (const row of group.rows) {
      rowNumber += 1;
      no += 1;
      const excelRow = ws.getRow(rowNumber);
      excelRow.height = pxToPoints(DATA_ROW_HEIGHT_PX);

      excelRow.getCell(COL.no).value = no;
      excelRow.getCell(COL.discipline).value = row.discipline?.code ?? "";
      excelRow.getCell(COL.notes).value = notesCell(row);
      excelRow.getCell(COL.identifiedDate).value = formatDate(row.createdAt);
      excelRow.getCell(COL.resolveProposed).value = truncateCell(row.resolveProposed);
      excelRow.getCell(COL.resolveByConsultant).value = truncateCell(row.resolveByConsultant);
      // "Resolve Date" adalah closedAt — clash yang belum ditutup memang
      // belum punya tanggal penyelesaian.
      excelRow.getCell(COL.resolveDate).value = row.closedAt ? formatDate(row.closedAt) : "";

      for (let c = 1; c <= COLUMN_COUNT; c++) {
        const cell = excelRow.getCell(c);
        cell.border = BORDER_ALL;
        cell.alignment = {
          vertical: "middle",
          horizontal: c === COL.no || c === COL.discipline ? "center" : "left",
          wrapText: true,
        };
        cell.font = { size: 9 };
      }

      placeImage(ExcelJS, workbook, ws, images, row.original?.attachmentId, COL.original, rowNumber);
      placeImage(
        ExcelJS,
        workbook,
        ws,
        images,
        row.clashDetection?.attachmentId,
        COL.clashDetection,
        rowNumber
      );
    }
  }

  // Dokumen ini dibuat untuk dicetak, bukan untuk jadi sumber pivot.
  // A4 landscape sebagai default karena itu yang selalu ada di kantor mana
  // pun; `fitToWidth: 1` membuat sembilan kolomnya menyusut ke satu lebar
  // halaman berapa pun kertas yang akhirnya dipilih, jadi memilih A3 di
  // dialog cetak tetap bekerja tanpa mengubah file. (PaperSize milik ExcelJS
  // tidak punya A3 sama sekali.)
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };

  return workbook;
}

/**
 * Menanam satu gambar, terpusat di dalam selnya.
 *
 * Tiga hal yang mudah salah pada anchor ExcelJS:
 *  - `tl.col`/`tl.row` BERBASIS 0, sedangkan getCell() berbasis 1.
 *  - Bagian pecahan anchor adalah proporsi terhadap ukuran sel ITU SENDIRI,
 *    jadi memusatkan berarti membagi offset dengan lebar/tinggi sel, bukan
 *    dengan konstanta.
 *  - `ext` dalam PIKSEL; ExcelJS yang mengonversinya ke EMU.
 *
 * `editAs: "oneCell"` membuat gambar ikut selnya tanpa terdistorsi;
 * "absolute" rusak begitu ada yang menyisipkan baris atau men-sort.
 */
function placeImage(
  ExcelJS: typeof ExcelJSNamespace,
  workbook: ExcelJSNamespace.Workbook,
  worksheet: ExcelJSNamespace.Worksheet,
  images: Map<string, EmbeddedImage>,
  attachmentId: string | undefined,
  column: number,
  rowNumber: number
) {
  if (!attachmentId) return;
  const image = images.get(attachmentId);
  if (!image || image.width <= 0 || image.height <= 0) return;

  const cellWidth = columnWidthToPx(COLUMNS[column - 1].width);
  const cellHeight = DATA_ROW_HEIGHT_PX;
  const fit = fitImage(image.width, image.height, cellWidth, cellHeight);
  if (fit.width <= 0 || fit.height <= 0) return;

  const imageId = workbook.addImage({ base64: image.dataUrl, extension: image.extension });
  // Bentuk tl+ext adalah ImagePosition (bukan ImageRange, yang menuntut br).
  worksheet.addImage(imageId, {
    tl: {
      col: column - 1 + fit.offsetX / cellWidth,
      row: rowNumber - 1 + fit.offsetY / cellHeight,
    },
    ext: { width: fit.width, height: fit.height },
    editAs: "oneCell",
  } satisfies ExcelJSNamespace.ImagePosition & { editAs: string });
}
