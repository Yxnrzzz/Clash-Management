import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  COLUMN_COUNT,
  DATA_ROW_HEIGHT_PX,
  NO_FLOOR_LABEL,
  columnWidthToPx,
  fitImage,
  groupByFloor,
  monthLabel,
  notesCell,
  pxToPoints,
  truncateCell,
} from "./layout";
import type { ApiClashReportRow } from "../api/types";

function row(overrides: Partial<ApiClashReportRow> = {}): ApiClashReportRow {
  return {
    id: "c1",
    uniqueCode: "JTB-ARS-0001",
    title: "Bentrok balok",
    description: "Deskripsi",
    createdAt: "2026-08-01T00:00:00.000Z",
    closedAt: null,
    resolveProposed: null,
    resolveByConsultant: null,
    discipline: { id: "d1", code: "ARS", name: "Arsitektur" },
    zone: { id: "z1", name: "Zona A", level: "Lantai 1" },
    status: { id: "s1", name: "Open" },
    original: null,
    clashDetection: null,
    ...overrides,
  };
}

describe("kolom", () => {
  it("punya sembilan kolom sesuai format konsultan", () => {
    expect(COLUMN_COUNT).toBe(9);
    expect(COLUMNS.map((c) => c.label)).toEqual([
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
  });
});

describe("konversi satuan", () => {
  it("mengubah lebar kolom jadi piksel", () => {
    expect(columnWidthToPx(34)).toBe(243);
    expect(columnWidthToPx(5)).toBe(40);
  });

  it("mengubah tinggi baris piksel jadi point", () => {
    // Tinggi baris Excel dalam POINT. 150px adalah 112.5pt, bukan 150.
    expect(pxToPoints(DATA_ROW_HEIGHT_PX)).toBe(112.5);
    expect(pxToPoints(20)).toBe(15);
  });
});

describe("fitImage", () => {
  it("mengecilkan gambar landscape agar muat lebar dan memusatkannya", () => {
    const fit = fitImage(1000, 500, 240, 150);
    // Lebar tersedia 232 (240 - 2*4) yang mengikat, bukan tingginya.
    expect(fit.width).toBe(232);
    expect(fit.height).toBe(116);
    expect(fit.offsetX).toBe(4);
    expect(fit.offsetY).toBe(17);
  });

  it("mengecilkan gambar portrait agar muat tinggi", () => {
    const fit = fitImage(500, 1000, 240, 150);
    expect(fit.height).toBe(142);
    expect(fit.width).toBe(71);
    // Terpusat horizontal: (240 - 71) / 2.
    expect(fit.offsetX).toBe(85);
  });

  it("tidak pernah memperbesar gambar kecil", () => {
    const fit = fitImage(40, 30, 240, 150);
    expect(fit.width).toBe(40);
    expect(fit.height).toBe(30);
    // Tetap terpusat meski tidak diskalakan.
    expect(fit.offsetX).toBe(100);
    expect(fit.offsetY).toBe(60);
  });

  it("menghormati padding sehingga gambar tidak menyentuh garis sel", () => {
    const noPad = fitImage(1000, 1000, 100, 100, 0);
    const padded = fitImage(1000, 1000, 100, 100, 10);
    expect(noPad.width).toBe(100);
    expect(padded.width).toBe(80);
  });

  it("mengembalikan nol untuk dimensi tidak masuk akal alih-alih NaN", () => {
    // Gambar korup bisa melaporkan 0x0; NaN akan merusak seluruh workbook.
    const fit = fitImage(0, 0, 240, 150);
    expect(fit.width).toBe(0);
    expect(fit.height).toBe(0);
  });

  it("mempertahankan rasio aspek pada kotak ekstrem", () => {
    const fit = fitImage(1000, 100, 240, 150);
    // Piksel bulat tidak bisa mempertahankan rasio 10:1 dengan tepat — 232/23
    // = 10.09. Yang penting gambarnya tidak teregang secara kasatmata, jadi
    // toleransinya relatif terhadap rasio, bukan absolut.
    expect(fit.width / fit.height).toBeGreaterThan(9.5);
    expect(fit.width / fit.height).toBeLessThan(10.5);
  });
});

describe("groupByFloor", () => {
  it("mengelompokkan baris per level zona", () => {
    const groups = groupByFloor([
      row({ id: "a", zone: { id: "z1", name: "A", level: "Lantai 1" } }),
      row({ id: "b", zone: { id: "z2", name: "B", level: "Basement 2 Plan" } }),
      row({ id: "c", zone: { id: "z3", name: "C", level: "Lantai 1" } }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.level === "Lantai 1")?.rows.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("menaruh level kosong di keranjang Tanpa Lantai, diurut terakhir", () => {
    const groups = groupByFloor([
      row({ id: "a", zone: { id: "z1", name: "A", level: "   " } }),
      row({ id: "b", zone: { id: "z2", name: "B", level: "Lantai 1" } }),
    ]);

    expect(groups.map((g) => g.level)).toEqual(["Lantai 1", NO_FLOOR_LABEL]);
  });

  it("mengikuti urutan zona master kalau diberikan", () => {
    // Memberi Admin kendali urutan lantai tanpa UI baru.
    const groups = groupByFloor(
      [
        row({ id: "a", zone: { id: "z1", name: "A", level: "Lantai 1" } }),
        row({ id: "b", zone: { id: "z2", name: "B", level: "Basement 2 Plan" } }),
      ],
      ["Basement 2 Plan", "Lantai 1"]
    );

    expect(groups.map((g) => g.level)).toEqual(["Basement 2 Plan", "Lantai 1"]);
  });

  it("mengurut level numerik secara alami, bukan leksikografis", () => {
    const groups = groupByFloor([
      row({ id: "a", zone: { id: "z1", name: "A", level: "Lantai 10" } }),
      row({ id: "b", zone: { id: "z2", name: "B", level: "Lantai 2" } }),
    ]);

    // Leksikografis akan menaruh "Lantai 10" sebelum "Lantai 2".
    expect(groups.map((g) => g.level)).toEqual(["Lantai 2", "Lantai 10"]);
  });

  it("mempertahankan urutan endpoint di dalam satu grup", () => {
    const groups = groupByFloor([
      row({ id: "c", zone: { id: "z1", name: "A", level: "L1" } }),
      row({ id: "a", zone: { id: "z1", name: "A", level: "L1" } }),
      row({ id: "b", zone: { id: "z1", name: "A", level: "L1" } }),
    ]);

    // Sort aktif Register sudah menentukan urutannya; jangan diacak ulang.
    expect(groups[0].rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("mengembalikan array kosong untuk baris kosong", () => {
    expect(groupByFloor([])).toEqual([]);
  });
});

describe("monthLabel", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");

  it("memakai bulan filter kalau rentangnya dalam satu bulan", () => {
    expect(monthLabel("2026-08-01", "2026-08-31", now)).toBe("Agustus-2026");
  });

  it("kembali ke hari ini kalau rentang melintasi bulan", () => {
    expect(monthLabel("2026-07-01", "2026-08-31", now)).toBe("September-2026");
  });

  it("kembali ke hari ini kalau tidak ada filter", () => {
    expect(monthLabel(null, null, now)).toBe("September-2026");
  });

  it("memakai satu-satunya batas yang diberikan", () => {
    expect(monthLabel("2026-08-10", null, now)).toBe("Agustus-2026");
  });

  it("mengabaikan tanggal tidak valid alih-alih menghasilkan NaN", () => {
    expect(monthLabel("bukan-tanggal", null, now)).toBe("September-2026");
  });
});

describe("truncateCell", () => {
  it("mengembalikan string kosong untuk null", () => {
    expect(truncateCell(null)).toBe("");
  });

  it("membiarkan teks pendek apa adanya", () => {
    expect(truncateCell("  singkat  ")).toBe("singkat");
  });

  it("memotong teks sangat panjang dengan elipsis yang terlihat", () => {
    const long = "x".repeat(1000);
    const out = truncateCell(long);
    expect(out).toHaveLength(901);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("notesCell", () => {
  it("menggabungkan judul, deskripsi, dan zona", () => {
    expect(notesCell(row())).toBe("Bentrok balok\nDeskripsi\nZona: Zona A");
  });

  it("melewati bagian yang kosong tanpa meninggalkan baris kosong", () => {
    expect(notesCell(row({ description: "", zone: { id: "z", name: "", level: "L1" } }))).toBe(
      "Bentrok balok"
    );
  });
});
