"use client";

import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type RenderTask } from "pdfjs-dist";
import type { PageBox } from "@/lib/annotations";

// Served as a plain static file copied from node_modules by
// scripts/copy-pdf-worker.mjs (predev/prebuild) — see that script's comment
// for why this is a static path rather than new URL(..., import.meta.url).
GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/**
 * Renders one PDF page to a <canvas>, isolated in its own module (loaded
 * only via `dynamic(..., { ssr: false })` from AttachmentPreviewModal) —
 * pdf.js touches DOMMatrix/Path2D/document at import time and must never
 * load during SSR or in the Vitest/jsdom test environment.
 *
 * Reports the page's rendered CSS-pixel box back to the caller so the
 * sibling AnnotationLayer (an absolutely-positioned SVG) can size itself to
 * match exactly — both live inside the same zoom/pan transform wrapper, so
 * neither needs to know about the current zoom level itself.
 */
export function PdfPageCanvas({
  url,
  pageNumber,
  onBoxChange,
  onPageCountChange,
}: {
  url: string;
  pageNumber: number;
  onBoxChange: (box: PageBox) => void;
  onPageCountChange: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function run() {
      try {
        const doc = await getDocument({ url }).promise;
        if (cancelled) return;
        onPageCountChange(doc.numPages);

        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        // Rendered at native CSS pixels — devicePixelRatio scales the
        // canvas's backing store only, so it stays crisp on hi-DPI screens
        // without inflating the CSS box the AnnotationLayer positions
        // against.
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        onBoxChange({ width: viewport.width / dpr, height: viewport.height / dpr });

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [url, pageNumber, onBoxChange, onPageCountChange]);

  if (error) {
    return <p className="p-4 text-sm text-red-300">Gagal memuat halaman PDF.</p>;
  }
  return <canvas ref={canvasRef} className="bg-white" />;
}
