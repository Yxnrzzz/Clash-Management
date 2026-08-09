/**
 * Membakar markup vektor ke atas raster.
 *
 * Diekstrak dari AttachmentPreviewModal supaya "Unduh dengan markup" (satu
 * gambar, atas permintaan) dan export laporan clash (ratusan gambar, batch)
 * memakai renderer yang sama persis. Ini kelanjutan dari kontrak yang sudah
 * dinyatakan src/lib/annotations.ts: geometri ternormalisasi dipakai bersama
 * oleh SVG overlay dan canvas flattener "so the two can never drift".
 * Menyalin logika ini untuk laporan akan membuat renderer KETIGA dengan
 * matematika arrowhead, penskalaan stroke, dan metrik font sendiri — dan
 * melencengnya baru ketahuan saat konsultan protes panahnya menunjuk ke
 * tempat lain.
 *
 * Tidak ada perubahan perilaku saat ekstraksi: buktinya
 * AttachmentPreviewModal.test.tsx lulus tanpa disentuh.
 */

import type { Annotation, PageBox } from "./annotations";
import { arrowHeadPoints, strokeWidthPixels, toPixels } from "./annotations";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function drawAnnotationsOnCanvas(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  box: PageBox
) {
  for (const annotation of annotations) {
    const shape = toPixels(annotation, box);
    const strokeWidthPx = strokeWidthPixels(annotation.strokeWidth, box);
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = strokeWidthPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.kind === "RECT") {
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    } else if (shape.kind === "ARROW") {
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      const [p1, p2] = arrowHeadPoints(shape.x1, shape.y1, shape.x2, shape.y2, strokeWidthPx);
      ctx.beginPath();
      ctx.moveTo(shape.x2, shape.y2);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();
      ctx.fill();
    } else if (shape.kind === "FREEHAND") {
      ctx.beginPath();
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    } else if (shape.kind === "TEXT") {
      ctx.font = `${shape.size}px sans-serif`;
      ctx.fillText(annotation.text ?? "", shape.x, shape.y + shape.size);
    }
  }
}

/** Skala render PDF. Sama dengan yang dipakai modal, jadi hasil "unduh
 * dengan markup" dan gambar di laporan berasal dari raster yang sama. */
const PDF_RENDER_SCALE = 2;

export interface FlattenedImage {
  /** data: URI. base64, bukan Blob, karena inilah yang diminta
   * ExcelJS.addImage() — tipe `Image.buffer` adalah Buffer milik Node yang
   * tidak ada di browser. Kebetulan juga jalur alami: canvas.toDataURL()
   * sudah menghasilkan base64. */
  dataUrl: string;
  /** "png" | "jpeg" — kosakata `extension` milik ExcelJS, yang tidak
   * menerima "jpg". */
  extension: "png" | "jpeg";
  width: number;
  height: number;
}

export interface FlattenOptions {
  url: string;
  kind: "image" | "pdf";
  /** Halaman PDF; diabaikan untuk gambar. */
  pageNumber?: number;
  annotations: Annotation[];
  /** Sisi terpanjang hasil akhir. Gambar tidak pernah diperbesar. */
  maxPx: number;
  /** PNG mempertahankan garis tajam tapi jauh lebih besar; untuk laporan
   * berisi ratusan gambar, JPEG adalah selisih antara xlsx 30 MB dan 200 MB. */
  preferPng?: boolean;
  signal?: AbortSignal;
}

/**
 * Memuat satu lampiran, membakar markup halamannya, lalu menurunkan
 * skalanya — bentuk umum dari handleDownloadWithMarkup() milik modal.
 *
 * Anotasi difilter ke `pageNumber` di sini, bukan oleh pemanggil, supaya
 * markup halaman 3 tidak pernah tercetak di halaman 1 hanya karena satu
 * pemanggil lupa memfilter.
 */
export async function renderFlattenedAttachment(
  opts: FlattenOptions
): Promise<FlattenedImage> {
  const pageNumber = opts.pageNumber ?? 1;
  const pageAnnotations = opts.annotations.filter((a) => a.pageNumber === pageNumber);

  const source = document.createElement("canvas");
  if (opts.kind === "image") {
    const img = await loadImage(opts.url);
    source.width = img.naturalWidth;
    source.height = img.naturalHeight;
    const ctx = source.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak tersedia.");
    ctx.drawImage(img, 0, 0);
    drawAnnotationsOnCanvas(ctx, pageAnnotations, {
      width: source.width,
      height: source.height,
    });
  } else {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ url: opts.url }).promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    source.width = viewport.width;
    source.height = viewport.height;
    const ctx = source.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak tersedia.");
    await page.render({ canvasContext: ctx, viewport, canvas: source }).promise;
    drawAnnotationsOnCanvas(ctx, pageAnnotations, {
      width: source.width,
      height: source.height,
    });
  }

  opts.signal?.throwIfAborted();

  const scale = Math.min(1, opts.maxPx / Math.max(source.width, source.height));
  const target = scale < 1 ? document.createElement("canvas") : source;
  if (scale < 1) {
    target.width = Math.max(1, Math.round(source.width * scale));
    target.height = Math.max(1, Math.round(source.height * scale));
    const ctx = target.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak tersedia.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  const extension = opts.preferPng ? "png" : "jpeg";
  return {
    dataUrl: target.toDataURL(extension === "png" ? "image/png" : "image/jpeg", 0.8),
    extension,
    width: target.width,
    height: target.height,
  };
}
