import { describe, expect, it } from "vitest";
import { collectImageTasks, MAX_IMAGE_PX } from "./images";
import { reportFilename } from "./download";
import type { ApiClashReportRow, ApiReportImage } from "../api/types";

function imageRef(attachmentId: string): ApiReportImage {
  return {
    attachmentId,
    fileName: `${attachmentId}.png`,
    fileType: "image/png",
    url: `/clashes/attachments/${attachmentId}/signed?token=x&expiresAt=1`,
    expiresAt: Date.now() + 60_000,
    annotations: [],
  };
}

function row(overrides: Partial<ApiClashReportRow> = {}): ApiClashReportRow {
  return {
    id: "c1",
    uniqueCode: "JTB-ARS-0001",
    title: "Bentrok",
    description: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    closedAt: null,
    resolveProposed: null,
    resolveByConsultant: null,
    discipline: { id: "d1", code: "ARS", name: "Arsitektur" },
    zone: { id: "z1", name: "A", level: "L1" },
    status: { id: "s1", name: "Open" },
    original: null,
    clashDetection: null,
    ...overrides,
  };
}

describe("collectImageTasks", () => {
  it("mengumpulkan kedua gambar tiap baris", () => {
    const tasks = collectImageTasks([
      row({ original: imageRef("a"), clashDetection: imageRef("b") }),
    ]);
    expect(tasks.map((t) => t.attachmentId)).toEqual(["a", "b"]);
  });

  it("melewati kolom gambar yang kosong", () => {
    const tasks = collectImageTasks([row({ original: imageRef("a") }), row({ id: "c2" })]);
    expect(tasks).toHaveLength(1);
  });

  it("tidak mengunduh lampiran yang sama dua kali", () => {
    // Satu file bisa saja ditandai di dua clash; mengunduhnya dua kali
    // membuang waktu paling mahal dalam proses ini.
    const tasks = collectImageTasks([
      row({ id: "c1", original: imageRef("sama") }),
      row({ id: "c2", uniqueCode: "JTB-ARS-0002", original: imageRef("sama") }),
    ]);
    expect(tasks).toHaveLength(1);
  });

  it("membawa kode clash untuk ringkasan kegagalan", () => {
    const tasks = collectImageTasks([
      row({ uniqueCode: "JTB-STR-0009", original: imageRef("a") }),
    ]);
    // Tanpa ini, ringkasan hanya bisa bilang "satu gambar gagal" tanpa
    // memberi tahu clash mana yang perlu diperiksa.
    expect(tasks[0].clashCode).toBe("JTB-STR-0009");
  });

  it("mengembalikan daftar kosong untuk laporan tanpa gambar", () => {
    expect(collectImageTasks([row()])).toEqual([]);
  });

  it("membatasi sisi terpanjang jauh di bawah resolusi penuh", () => {
    // Sel targetnya ~240x150 px; 700 sudah 2x untuk cetak. Tanpa batas ini
    // xlsx-nya membengkak ke ratusan MB.
    expect(MAX_IMAGE_PX).toBe(700);
  });
});

describe("reportFilename", () => {
  it("memakai kode proyek dan tanggal", () => {
    expect(reportFilename("JTB", new Date(2026, 7, 9))).toBe(
      "laporan-clash-JTB-2026-08-09.xlsx"
    );
  });

  it("membuang karakter yang tidak aman untuk nama file", () => {
    expect(reportFilename("JT/B:*?", new Date(2026, 0, 5))).toBe(
      "laporan-clash-JTB-2026-01-05.xlsx"
    );
  });

  it("kembali ke nama umum kalau kodenya habis tersaring", () => {
    expect(reportFilename("///", new Date(2026, 0, 5))).toBe(
      "laporan-clash-proyek-2026-01-05.xlsx"
    );
  });
});
