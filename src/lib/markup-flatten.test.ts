import { describe, expect, it } from "vitest";
import { drawAnnotationsOnCanvas } from "./markup-flatten";
import { strokeWidthPixels, type Annotation, type PageBox } from "./annotations";

/**
 * jsdom tidak punya konteks canvas 2D sungguhan, jadi getContext("2d")
 * mengembalikan null dan tidak ada yang bisa di-assert dari piksel. Sebagai
 * gantinya: konteks palsu yang merekam setiap panggilan, sehingga yang diuji
 * adalah PERINTAH GAMBAR yang dikeluarkan — persis lapisan tempat bug
 * "panahnya menunjuk ke tempat yang salah" akan muncul.
 */
type Call = { fn: string; args: unknown[] };

function recordingContext() {
  const calls: Call[] = [];
  const record =
    (fn: string) =>
    (...args: unknown[]) => {
      calls.push({ fn, args });
    };

  const ctx = {
    calls,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    font: "",
    strokeRect: record("strokeRect"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillText: record("fillText"),
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] };
}

const BOX: PageBox = { width: 1000, height: 500 };

function annotation(overrides: Partial<Annotation>): Annotation {
  return {
    id: "an-1",
    attachmentId: "att-1",
    pageNumber: 1,
    authorId: "u-1",
    kind: "RECT",
    geometry: { x: 0, y: 0, w: 1, h: 1 },
    color: "#ef4444",
    strokeWidth: 0.004,
    text: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function callsOf(ctx: { calls: Call[] }, fn: string) {
  return ctx.calls.filter((c) => c.fn === fn);
}

describe("drawAnnotationsOnCanvas", () => {
  it("mengubah RECT ternormalisasi jadi piksel kotak halaman", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [annotation({ kind: "RECT", geometry: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } })],
      BOX
    );

    // x/w diskalakan oleh lebar, y/h oleh tinggi — bukan satu skalar.
    expect(callsOf(ctx, "strokeRect")[0].args).toEqual([100, 100, 500, 125]);
  });

  it("memakai strokeWidth ternormalisasi lebar, bukan piksel mentah", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(ctx, [annotation({ strokeWidth: 0.01 })], BOX);

    // 0.01 x lebar 1000 = 10. Dinormalkan oleh LEBAR saja, kalau tidak
    // stroke akan meregang di halaman non-persegi.
    expect(ctx.lineWidth).toBe(10);
    expect(ctx.lineWidth).toBe(strokeWidthPixels(0.01, BOX));
  });

  it("menggambar batang panah lalu kepala panah tertutup yang terisi", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [annotation({ kind: "ARROW", geometry: { x1: 0, y1: 0, x2: 0.5, y2: 0.5 } })],
      BOX
    );

    expect(callsOf(ctx, "moveTo")[0].args).toEqual([0, 0]);
    expect(callsOf(ctx, "lineTo")[0].args).toEqual([500, 250]);
    expect(callsOf(ctx, "stroke")).toHaveLength(1);
    // Kepala panah: dua sisi + closePath + fill.
    expect(callsOf(ctx, "lineTo")).toHaveLength(3);
    expect(callsOf(ctx, "closePath")).toHaveLength(1);
    expect(callsOf(ctx, "fill")).toHaveLength(1);
  });

  it("menyambung titik FREEHAND dengan satu moveTo di awal", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [
        annotation({
          kind: "FREEHAND",
          geometry: { points: [[0, 0], [0.25, 0.5], [1, 1]] },
        }),
      ],
      BOX
    );

    expect(callsOf(ctx, "moveTo").map((c) => c.args)).toEqual([[0, 0]]);
    expect(callsOf(ctx, "lineTo").map((c) => c.args)).toEqual([
      [250, 250],
      [1000, 500],
    ]);
  });

  it("menempatkan TEXT pada baseline, bukan pada titik anchor", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [
        annotation({
          kind: "TEXT",
          geometry: { x: 0.1, y: 0.2, size: 0.05 },
          text: "Perlu revisi",
        }),
      ],
      BOX
    );

    // size dinormalkan oleh lebar: 0.05 x 1000 = 50px, dan y digeser ke
    // bawah sebesar itu supaya teks duduk di bawah titik anchor.
    expect(ctx.font).toBe("50px sans-serif");
    expect(callsOf(ctx, "fillText")[0].args).toEqual(["Perlu revisi", 100, 150]);
  });

  it("menggambar TEXT kosong sebagai string kosong, bukan 'null'", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [annotation({ kind: "TEXT", geometry: { x: 0, y: 0, size: 0.05 }, text: null })],
      BOX
    );

    expect(callsOf(ctx, "fillText")[0].args[0]).toBe("");
  });

  it("memakai warna tiap anotasi, bukan warna anotasi terakhir untuk semua", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(
      ctx,
      [
        annotation({ id: "a", color: "#ff0000" }),
        annotation({ id: "b", color: "#0000ff" }),
      ],
      BOX
    );

    expect(callsOf(ctx, "strokeRect")).toHaveLength(2);
    // Warna disetel per-anotasi di dalam loop; setelah loop yang tersisa
    // adalah warna terakhir.
    expect(ctx.strokeStyle).toBe("#0000ff");
  });

  it("tidak menggambar apa pun untuk daftar kosong", () => {
    const ctx = recordingContext();
    drawAnnotationsOnCanvas(ctx, [], BOX);
    expect(ctx.calls).toHaveLength(0);
  });
});
