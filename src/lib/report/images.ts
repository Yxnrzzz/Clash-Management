/**
 * Mengambil dan meratakan gambar laporan di browser.
 *
 * Ini bagian yang lambat: satu laporan 300 baris berarti sampai 600 gambar
 * diunduh, didekode, dibakari markup, diturunkan skalanya, lalu diencode
 * ulang. Karena itu ada pool konsumen, progress determinate, dan pembatalan
 * — bukan sekadar Promise.all atas semuanya.
 */

import { renderFlattenedAttachment } from "../markup-flatten";
import { toAnnotation } from "../api/mappers";
import { apiDownloadBlob } from "../api/client";
import type { ApiClashReportRow, ApiReportImage } from "../api/types";
import type { EmbeddedImage } from "./workbook";

/**
 * Sisi terpanjang gambar tertanam. Sel targetnya ~240x150 px, jadi 700
 * sudah sekitar 2x untuk kebutuhan cetak. Tanpa batas ini, 600 PNG resolusi
 * penuh menghasilkan xlsx 150-200 MB; dengan batas ini sekitar 25-40 MB.
 */
export const MAX_IMAGE_PX = 700;

/** Berapa gambar diproses bersamaan. Terlalu tinggi hanya memperebutkan
 * main thread untuk dekode/encode canvas dan membuat UI tersendat. */
const CONCURRENCY = 5;

export interface ImageTask {
  attachmentId: string;
  ref: ApiReportImage;
  clashCode: string;
}

export interface FetchImagesResult {
  images: Map<string, EmbeddedImage>;
  /** Lampiran yang tidak berhasil dipasang, untuk ringkasan akhir. */
  failed: { clashCode: string; fileName: string; reason: string }[];
}

/** Semua ref gambar dalam satu laporan, tanpa duplikat. */
export function collectImageTasks(rows: ApiClashReportRow[]): ImageTask[] {
  const tasks: ImageTask[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const ref of [row.original, row.clashDetection]) {
      if (!ref || seen.has(ref.attachmentId)) continue;
      seen.add(ref.attachmentId);
      tasks.push({ attachmentId: ref.attachmentId, ref, clashCode: row.uniqueCode });
    }
  }
  return tasks;
}

function isPdf(fileType: string): boolean {
  return fileType === "application/pdf";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca lampiran."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Sumber gambar untuk satu lampiran.
 *
 * URL bertanda tangan dipakai APA ADANYA, bukan diunduh dulu jadi blob:
 * CSP aplikasi ini adalah `img-src 'self' data:` (lihat next.config.ts) dan
 * TIDAK mengizinkan blob:, jadi object URL akan diblokir browser saat
 * dipasang ke img.src. Terbukti secara empiris, bukan diasumsikan. Memakai
 * URL same-origin langsung juga menghemat satu fetch penuh per gambar —
 * pada 600 gambar itu bukan penghematan yang sepele.
 *
 * Rute terautentikasi baru dipakai kalau yang bertanda tangan gagal (paling
 * mungkin TTL 15 menitnya habis pada laporan sangat besar). Hasilnya
 * dikonversi ke data: URI, yang diizinkan CSP.
 */
async function resolveSourceUrl(
  task: ImageTask,
  clashId: string
): Promise<{ url: string; revoke: boolean }> {
  const signed = `/api${task.ref.url}`;
  try {
    const probe = await fetch(signed, { method: "HEAD" });
    if (probe.ok) return { url: signed, revoke: false };
  } catch {
    // jatuh ke rute terautentikasi
  }

  const blob = await apiDownloadBlob(
    `/clashes/${clashId}/attachments/${task.attachmentId}/download`
  );
  return { url: await blobToDataUrl(blob), revoke: false };
}

export interface FetchImagesOptions {
  rows: ApiClashReportRow[];
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Satu gambar rusak tidak boleh membunuh laporan: kegagalan dicatat dan
 * dilaporkan di ringkasan akhir, selnya dibiarkan kosong. Laporan dengan 599
 * gambar dan satu catatan jauh lebih berguna daripada tidak ada laporan.
 */
export async function fetchReportImages(
  options: FetchImagesOptions
): Promise<FetchImagesResult> {
  const tasks = collectImageTasks(options.rows);
  const clashIdByAttachment = new Map<string, string>();
  for (const row of options.rows) {
    for (const ref of [row.original, row.clashDetection]) {
      if (ref) clashIdByAttachment.set(ref.attachmentId, row.id);
    }
  }

  const images = new Map<string, EmbeddedImage>();
  const failed: FetchImagesResult["failed"] = [];
  let done = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      if (options.signal?.aborted) return;
      const index = cursor++;
      if (index >= tasks.length) return;
      const task = tasks[index];

      try {
        const source = await resolveSourceUrl(
          task,
          clashIdByAttachment.get(task.attachmentId) ?? ""
        );
        const flattened = await renderFlattenedAttachment({
          url: source.url,
          kind: isPdf(task.ref.fileType) ? "pdf" : "image",
          pageNumber: 1,
          annotations: task.ref.annotations.map(toAnnotation),
          maxPx: MAX_IMAGE_PX,
          // PNG hanya untuk gambar kecil: di atas itu selisih ukurannya
          // menentukan apakah xlsx-nya 30 MB atau 200 MB.
          preferPng: false,
          signal: options.signal,
        });
        images.set(task.attachmentId, flattened);
      } catch (error) {
        failed.push({
          clashCode: task.clashCode,
          fileName: task.ref.fileName,
          reason: error instanceof Error ? error.message : "tidak diketahui",
        });
      } finally {
        done += 1;
        options.onProgress?.(done, tasks.length);
      }
    }
  }

  options.onProgress?.(0, tasks.length);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));

  return { images, failed };
}
