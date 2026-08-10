import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildClashReportWorkbook, type EmbeddedImage } from "./workbook";
import { COL, DATA_ROW_HEIGHT_PX, pxToPoints } from "./layout";
import type { ApiClashReportRow, ApiReportImage } from "../api/types";

/** PNG 2x1 valid — cukup untuk membuktikan gambar benar-benar tertanam dan
 * anchornya terbaca kembali setelah round-trip. */
const PNG_2x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAADjAO9DAAAAFUlEQVR4nGP8z8Dwn4GBgYEJRIAAAwAY/wMBQzJhFwAAAABJRU5ErkJggg==";

function image(overrides: Partial<EmbeddedImage> = {}): EmbeddedImage {
  return { dataUrl: PNG_2x1, extension: "png", width: 200, height: 100, ...overrides };
}

function imageRef(attachmentId: string): ApiReportImage {
  return {
    attachmentId,
    fileName: `${attachmentId}.png`,
    fileType: "image/png",
    url: "/signed",
    expiresAt: Date.now() + 60_000,
    annotations: [],
  };
}

function row(overrides: Partial<ApiClashReportRow> = {}): ApiClashReportRow {
  return {
    id: "c1",
    uniqueCode: "JTB-ARS-0001",
    title: "Bentrok balok",
    description: "Deskripsi panjang",
    createdAt: "2026-08-01T00:00:00.000Z",
    closedAt: null,
    resolveProposed: null,
    resolveByConsultant: null,
    discipline: { id: "d1", code: "ARS", name: "Arsitektur" },
    zone: { id: "z1", name: "Zona A", level: "Basement 2 Plan" },
    status: { id: "s1", name: "Open" },
    original: null,
    clashDetection: null,
    ...overrides,
  };
}

const OPTIONS = { projectName: "JTrust City Bank", monthLabel: "Agustus-2026" };

function build(rows: ApiClashReportRow[], images = new Map<string, EmbeddedImage>()) {
  return buildClashReportWorkbook(ExcelJS, rows, images, OPTIONS);
}

/** Tulis lalu baca kembali. Inilah yang membuktikan file-nya VALID, bukan
 * sekadar terkonstruksi di memori — struktur yang salah baru meledak saat
 * di-serialize atau saat Excel membukanya. */
async function roundTrip(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return { reloaded, byteLength: buffer.byteLength };
}

describe("buildClashReportWorkbook — struktur", () => {
  it("menulis judul dan label bulan yang ter-merge", () => {
    const ws = build([row()]).getWorksheet("Clash Detection")!;

    expect(ws.getCell("A1").value).toBe("Tabel Clash Detection - Proyek JTrust City Bank");
    expect(ws.getCell("A2").value).toBe("Agustus-2026");
    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    expect(merges).toContain("A1:I1");
    expect(merges).toContain("A2:I2");
  });

  it("menulis sembilan header dan membekukannya", () => {
    const ws = build([row()]).getWorksheet("Clash Detection")!;

    expect(ws.getRow(3).values).toEqual([
      undefined,
      "No.",
      "Original",
      "Discipline",
      "Notes / Location",
      "Clash Detection",
      "Clash Indentified Date",
      "Resolve (TATA Proposed)",
      "Resolve by Consultant",
      "Resolve Date",
    ]);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
  });

  it("menyisipkan band lantai ter-merge sebelum barisnya", () => {
    const ws = build([
      row({ id: "a", zone: { id: "z1", name: "A", level: "Basement 2 Plan" } }),
      row({ id: "b", zone: { id: "z2", name: "B", level: "Lantai 1" } }),
    ]).getWorksheet("Clash Detection")!;

    expect(ws.getCell("A4").value).toBe("Floor: Basement 2 Plan");
    expect(ws.getCell("A5").value).toBe(1);
    expect(ws.getCell("A6").value).toBe("Floor: Lantai 1");
    expect(ws.getCell("A7").value).toBe(2);

    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    expect(merges).toContain("A4:I4");
    expect(merges).toContain("A6:I6");
  });

  it("menomori baris berurutan di seluruh sheet, tidak me-reset per lantai", () => {
    const ws = build([
      row({ id: "a", zone: { id: "z1", name: "A", level: "L1" } }),
      row({ id: "b", zone: { id: "z2", name: "B", level: "L2" } }),
      row({ id: "c", zone: { id: "z2", name: "B", level: "L2" } }),
    ]).getWorksheet("Clash Detection")!;

    // L1: band(4) baris(5) | L2: band(6) baris(7,8)
    expect(ws.getCell("A5").value).toBe(1);
    expect(ws.getCell("A7").value).toBe(2);
    expect(ws.getCell("A8").value).toBe(3);
  });

  it("memberi tinggi baris data dalam point, bukan piksel", () => {
    const ws = build([row()]).getWorksheet("Clash Detection")!;
    expect(ws.getRow(5).height).toBe(pxToPoints(DATA_ROW_HEIGHT_PX));
    expect(ws.getRow(5).height).toBe(112.5);
  });

  it("memberi border pada seluruh sel penyusun baris merge", () => {
    const ws = build([row()]).getWorksheet("Clash Detection")!;
    // Sel gabungan tidak menyebarkan border; tanpa penanganan khusus, baris
    // judul akan tampak sebagai lubang di grid.
    expect(ws.getCell("A1").border?.top?.style).toBe("thin");
    expect(ws.getCell("I1").border?.right?.style).toBe("thin");
    expect(ws.getCell("E4").border?.bottom?.style).toBe("thin");
  });
});

describe("buildClashReportWorkbook — isi sel", () => {
  it("mengisi kolom teks dari baris laporan", () => {
    const ws = build([
      row({
        resolveProposed: "Geser sparing 200mm",
        resolveByConsultant: "Disetujui",
        closedAt: "2026-08-20T00:00:00.000Z",
      }),
    ]).getWorksheet("Clash Detection")!;

    expect(ws.getCell(5, COL.discipline).value).toBe("ARS");
    expect(String(ws.getCell(5, COL.notes).value)).toContain("Bentrok balok");
    expect(String(ws.getCell(5, COL.notes).value)).toContain("Zona: Zona A");
    expect(ws.getCell(5, COL.resolveProposed).value).toBe("Geser sparing 200mm");
    expect(ws.getCell(5, COL.resolveByConsultant).value).toBe("Disetujui");
    expect(ws.getCell(5, COL.identifiedDate).value).toBe("01 Agu 2026");
    expect(ws.getCell(5, COL.resolveDate).value).toBe("20 Agu 2026");
  });

  it("mengosongkan Resolve Date untuk clash yang belum ditutup", () => {
    const ws = build([row({ closedAt: null })]).getWorksheet("Clash Detection")!;
    expect(ws.getCell(5, COL.resolveDate).value).toBe("");
  });
});

describe("buildClashReportWorkbook — gambar", () => {
  it("menanam kedua gambar di kolomnya masing-masing", () => {
    const images = new Map([
      ["att-orig", image()],
      ["att-clash", image()],
    ]);
    const ws = build(
      [row({ original: imageRef("att-orig"), clashDetection: imageRef("att-clash") })],
      images
    ).getWorksheet("Clash Detection")!;

    const embedded = ws.getImages();
    expect(embedded).toHaveLength(2);
    // Anchor berbasis 0: kolom Original (2) jadi 1, Clash Detection (5) jadi 4.
    expect(embedded.map((i) => i.range.tl.nativeCol).sort()).toEqual([1, 4]);
    expect(embedded.every((i) => i.range.tl.nativeRow === 4)).toBe(true);
  });

  it("melewati sel gambar yang tidak punya lampiran bertanda", () => {
    const ws = build([row()]).getWorksheet("Clash Detection")!;
    // Tanpa tebakan implisit: sel kosong lebih baik daripada foto yang salah.
    expect(ws.getImages()).toHaveLength(0);
  });

  it("melewati gambar yang gagal dimuat sehingga tidak ada di peta", () => {
    const ws = build(
      [row({ original: imageRef("att-hilang") })],
      new Map()
    ).getWorksheet("Clash Detection")!;

    expect(ws.getImages()).toHaveLength(0);
  });

  it("mengabaikan gambar berdimensi nol alih-alih menanam anchor NaN", () => {
    const images = new Map([["att-rusak", image({ width: 0, height: 0 })]]);
    const ws = build([row({ original: imageRef("att-rusak") })], images).getWorksheet(
      "Clash Detection"
    )!;

    expect(ws.getImages()).toHaveLength(0);
  });

  it("menahan gambar di dalam selnya lewat editAs oneCell", () => {
    const images = new Map([["att-orig", image()]]);
    const ws = build([row({ original: imageRef("att-orig") })], images).getWorksheet(
      "Clash Detection"
    )!;

    // "absolute" akan rusak begitu ada yang menyisipkan baris atau men-sort.
    // `editAs` ada saat runtime tapi tidak dinyatakan di tipe ImageRange.
    const range = ws.getImages()[0].range as unknown as { editAs?: string };
    expect(range.editAs).toBe("oneCell");
  });
});

describe("buildClashReportWorkbook — round-trip", () => {
  it("menghasilkan xlsx valid yang bisa dibaca ulang lengkap dengan gambarnya", async () => {
    const images = new Map([
      ["att-orig", image()],
      ["att-clash", image()],
    ]);
    const workbook = build(
      [
        row({
          id: "a",
          zone: { id: "z1", name: "A", level: "Basement 2 Plan" },
          original: imageRef("att-orig"),
          clashDetection: imageRef("att-clash"),
        }),
        row({ id: "b", zone: { id: "z2", name: "B", level: "Lantai 1" } }),
      ],
      images
    );

    const { reloaded, byteLength } = await roundTrip(workbook);
    expect(byteLength).toBeGreaterThan(0);

    const ws = reloaded.getWorksheet("Clash Detection")!;
    expect(ws.getCell("A1").value).toBe("Tabel Clash Detection - Proyek JTrust City Bank");
    expect(ws.getRow(5).height).toBe(112.5);
    expect(ws.getImages()).toHaveLength(2);

    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    expect(merges).toContain("A1:I1");
    expect(merges).toContain("A4:I4");
  });

  it("bertahan pada laporan tanpa baris sama sekali", async () => {
    const { reloaded } = await roundTrip(build([]));
    const ws = reloaded.getWorksheet("Clash Detection")!;

    // Header tetap ada supaya file kosong masih terbaca sebagai laporan.
    expect(ws.getCell("B3").value).toBe("Original");
    expect(ws.getImages()).toHaveLength(0);
  });
});
