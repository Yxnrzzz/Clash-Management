import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./lookup";
import type { Clash, Discipline, Priority, Status, User, Zone } from "./types";

export interface ExportLookups {
  disciplineById: (id: string) => Discipline | undefined;
  zoneById: (id: string) => Zone | undefined;
  statusById: (id: string) => Status | undefined;
  priorityById: (id: string) => Priority | undefined;
  userById: (id: string | null) => User | undefined;
}

function toRow(c: Clash, lookups: ExportLookups) {
  return {
    "Kode Unik": c.kodeUnik,
    Judul: c.judul,
    Disiplin: lookups.disciplineById(c.disciplineId)?.nama ?? "-",
    Zona: (() => {
      const z = lookups.zoneById(c.zoneId);
      return z ? `${z.level} · ${z.nama}` : "-";
    })(),
    Status: lookups.statusById(c.statusId)?.nama ?? "-",
    Prioritas: lookups.priorityById(c.priorityId)?.nama ?? "-",
    Reporter: lookups.userById(c.reporterId)?.nama ?? "-",
    Assignee: lookups.userById(c.assigneeId)?.nama ?? "Belum ditugaskan",
    "Due Date": formatDate(c.dueDate),
    "Dibuat": formatDate(c.createdAt),
    "Ditutup": formatDate(c.closedAt),
  };
}

/** US-E2: Excel export respects whatever filter set produced `clashes`. */
export function exportClashesToExcel(clashes: Clash[], lookups: ExportLookups, filename: string) {
  const rows = clashes.map((c) => toRow(c, lookups));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 20 }, { wch: 12 },
    { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];
  // Freeze the header row so it stays visible while scrolling long registers.
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Clash Register");
  XLSX.writeFile(workbook, filename);
}

export interface PdfKpiSummary {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  mttrDays: number | null;
}

/**
 * US-E2: "PDF berisi ringkasan KPI + tabel". Generated client-side with
 * jsPDF/autotable so it works without a backend — same filtered dataset the
 * Excel export uses.
 */
export function exportClashesToPdf(
  clashes: Clash[],
  lookups: ExportLookups,
  kpi: PdfKpiSummary,
  projectName: string,
  filename: string
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setFontSize(14);
  doc.text("ClashHub — Laporan Clash Register", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${projectName} · Dibuat ${generatedAt}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    head: [["Total", "Belum selesai", "Closed", "Overdue", "Mean time to resolution"]],
    body: [[
      String(kpi.total),
      String(kpi.open),
      String(kpi.closed),
      String(kpi.overdue),
      kpi.mttrDays === null ? "-" : `${kpi.mttrDays} hari`,
    ]],
    headStyles: { fillColor: [244, 244, 243], textColor: [30, 30, 30], fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold" },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: finalY + 8,
    head: [["Kode", "Judul", "Disiplin", "Zona", "Status", "Prioritas", "Assignee", "Due Date"]],
    body: clashes.map((c) => {
      const zone = lookups.zoneById(c.zoneId);
      return [
        c.kodeUnik,
        c.judul,
        lookups.disciplineById(c.disciplineId)?.kode ?? "-",
        zone ? `${zone.level} · ${zone.nama}` : "-",
        lookups.statusById(c.statusId)?.nama ?? "-",
        lookups.priorityById(c.priorityId)?.nama ?? "-",
        lookups.userById(c.assigneeId)?.nama ?? "-",
        formatDate(c.dueDate),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [23, 23, 23], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 250, 249] },
    columnStyles: { 1: { cellWidth: 70 } },
  });

  doc.save(filename);
}
