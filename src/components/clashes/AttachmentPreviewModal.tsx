"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Attachment, Role, User } from "@/lib/types";
import { canDrawAnnotation, canEditAnnotation, formatBytes } from "@/lib/lookup";
import { useSignedUrl } from "@/lib/use-signed-url";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { annotationPayload, toAnnotation } from "@/lib/api/mappers";
import type { ApiAnnotation } from "@/lib/api/types";
import {
  arrowHeadPoints,
  strokeWidthPixels,
  toPixels,
  type Annotation,
  type Geometry,
  type PageBox,
} from "@/lib/annotations";
import { AnnotationLayer, type AnnotationTool } from "./AnnotationLayer";
import { AnnotationToolbar } from "./AnnotationToolbar";

// pdf.js touches document/DOMMatrix at import time and must never load
// during SSR — isolated in its own module, loaded only client-side.
const PdfPageCanvas = dynamic(() => import("./PdfPageCanvas").then((m) => m.PdfPageCanvas), {
  ssr: false,
});

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Measures an element's un-transformed layout box (clientWidth/Height are
 * immune to an ancestor's CSS `transform: scale(...)`, unlike
 * getBoundingClientRect) — used so the AnnotationLayer overlay always
 * matches the rendered image/canvas exactly, at any zoom level.
 *
 * `deps` re-establishes the observer whenever the underlying element might
 * have been swapped out from under the same ref — `ref` itself is a stable
 * object from useRef and wouldn't otherwise trigger a re-run. Callers must
 * include whatever condition gates the ref's element from actually
 * rendering (e.g. a loading flag): on the very first render `ref.current`
 * is still null (the element behind an "Memuat…" placeholder hasn't
 * mounted yet), so a dep that only reflects the attachment id would fire
 * once, find nothing, and never retry once the element finally mounts.
 *
 * No manual initial `measure()` call: ResizeObserver's spec guarantees one
 * async callback right after `observe()` starts, which is what avoids a
 * synchronous setState in the effect body (an earlier version called
 * setBox on every single render with no dependency array, which fed a
 * fresh `{width, height}` object back into the component each time and
 * looped forever). */
function useElementBox(ref: React.RefObject<HTMLElement | null>, deps: React.DependencyList): PageBox | null {
  const [box, setBox] = useState<PageBox | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setBox((prev) =>
          prev && prev.width === el.clientWidth && prev.height === el.clientHeight
            ? prev
            : { width: el.clientWidth, height: el.clientHeight }
        );
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ref` is a stable useRef object; `deps` (caller-supplied) is the deliberate re-trigger.
  }, deps);

  return box;
}

export function AttachmentPreviewModal({
  clashId,
  attachments,
  index,
  onIndexChange,
  onClose,
  userById,
  currentUser,
}: {
  clashId: string;
  attachments: Attachment[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  userById: (id: string) => User | undefined;
  currentUser: { id: string; peran: Role };
}) {
  const current = attachments[index];
  const { url, refresh } = useSignedUrl(clashId, current?.id ?? null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  // `url` must be in the deps: on the first render (and right after
  // switching attachments) it's still null, so contentRef's element hasn't
  // mounted yet — the effect needs to re-run once it resolves.
  const box = useElementBox(contentRef, [current?.id, url]);

  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [color, setColor] = useState("#ef4444");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flattening, setFlattening] = useState(false);

  const canDraw = canDrawAnnotation(currentUser.peran);

  // Reset zoom/pan/page/tool whenever the attachment changes — done during
  // render (React's "adjusting state when a prop changes" pattern) rather
  // than in an effect, so it can't flash the old attachment's state.
  const [resetFor, setResetFor] = useState<string | null>(current?.id ?? null);
  if (current?.id !== resetFor) {
    setResetFor(current?.id ?? null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setPageNumber(1);
    setPageCount(1);
    setAnnotations([]);
    setTool("select");
    setSelectedId(null);
  }

  // Fetches markup for the current attachment — modal-local state, not
  // data-context: annotations are per-attachment and short-lived, unlike
  // the clashesById/attachments caches other pages share.
  useEffect(() => {
    if (!current?.id) return;
    let cancelled = false;
    apiGet<ApiAnnotation[]>(`/clashes/${clashId}/attachments/${current.id}/annotations`)
      .then((rows) => {
        if (!cancelled) setAnnotations(rows.map(toAnnotation));
      })
      .catch(() => {
        // Non-fatal — markup simply doesn't show; the attachment itself
        // still previews fine.
      });
    return () => {
      cancelled = true;
    };
  }, [clashId, current?.id]);

  // Focus management + Escape/arrow keys + no background scroll.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange(clamp(index - 1, 0, attachments.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange(clamp(index + 1, 0, attachments.length - 1));
      }
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bind on every index change so Arrow keys always clamp against the current index
  }, [index, attachments.length]);

  // React's onWheel is passive, so preventDefault() there is a no-op —
  // attach manually to actually stop the page from scrolling while zooming.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      setScale((s) => clamp(s * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), MIN_SCALE, MAX_SCALE));
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleBoxChange = useCallback(() => {
    // PdfPageCanvas sizes its own <canvas> in CSS px; the shared
    // useElementBox(contentRef) measurement (below) picks that size up the
    // same way it does for <img>, so this callback only needs to exist to
    // satisfy PdfPageCanvas's prop contract.
  }, []);

  if (!current) return null;

  const uploader = userById(current.uploadedBy)?.nama ?? "?";
  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;

  function handlePointerDown(e: React.PointerEvent) {
    if (scale === 1 || tool !== "pan") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  async function handleCreateShape(kind: "RECT" | "ARROW" | "FREEHAND", geometry: Geometry) {
    const created = await apiPost<ApiAnnotation>(
      `/clashes/${clashId}/attachments/${current.id}/annotations`,
      { ...annotationPayload({ kind, geometry, color }), pageNumber }
    );
    const mapped = toAnnotation(created);
    setAnnotations((prev) => [...prev, mapped]);
    setSelectedId(mapped.id);
    setTool("select");
  }

  async function handleCreateText(geometry: Geometry, text: string) {
    const created = await apiPost<ApiAnnotation>(
      `/clashes/${clashId}/attachments/${current.id}/annotations`,
      { ...annotationPayload({ kind: "TEXT", geometry, color, text }), pageNumber }
    );
    const mapped = toAnnotation(created);
    setAnnotations((prev) => [...prev, mapped]);
    setSelectedId(mapped.id);
    setTool("select");
  }

  async function handleUpdateText(annotationId: string, text: string) {
    const previous = annotations;
    setAnnotations((prev) => prev.map((a) => (a.id === annotationId ? { ...a, text } : a)));
    try {
      await apiPatch(`/clashes/${clashId}/attachments/${current.id}/annotations/${annotationId}`, { text });
    } catch {
      setAnnotations(previous);
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    if (selectedId === annotationId) setSelectedId(null);
    try {
      await apiDelete(`/clashes/${clashId}/attachments/${current.id}/annotations/${annotationId}`);
    } catch {
      // Roll back the optimistic removal — a follow-up open of the modal
      // would otherwise silently disagree with the server.
      void apiGet<ApiAnnotation[]>(`/clashes/${clashId}/attachments/${current.id}/annotations`)
        .then((rows) => setAnnotations(rows.map(toAnnotation)))
        .catch(() => {});
    }
  }

  async function handleDownloadWithMarkup() {
    if (!url || flattening) return;
    setFlattening(true);
    try {
      const canvas = document.createElement("canvas");
      const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);

      if (current.tipe === "image") {
        const img = await loadImage(url);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        drawAnnotationsOnCanvas(ctx, pageAnnotations, { width: canvas.width, height: canvas.height });
      } else {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        drawAnnotationsOnCanvas(ctx, pageAnnotations, { width: canvas.width, height: canvas.height });
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `${current.namaFile.replace(/\.[^.]+$/, "")}-markup.png`;
        a.click();
        URL.revokeObjectURL(objectUrl);
      }, "image/png");
    } finally {
      setFlattening(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={current.namaFile}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{current.namaFile}</p>
          <p className="text-xs text-zinc-300">
            {index + 1} / {attachments.length} · {formatBytes(current.ukuranBytes)} · diunggah
            oleh {uploader}
            {current.tipe === "pdf" && pageCount > 1 ? ` · halaman ${pageNumber}/${pageCount}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AnnotationToolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            canDraw={canDraw}
          />
          {current.tipe === "pdf" && pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPageNumber((p) => clamp(p - 1, 1, pageCount))}
                disabled={pageNumber === 1}
                aria-label="Halaman sebelumnya"
                className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setPageNumber((p) => clamp(p + 1, 1, pageCount))}
                disabled={pageNumber === pageCount}
                aria-label="Halaman berikutnya"
                className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setScale((s) => clamp(s / ZOOM_STEP, MIN_SCALE, MAX_SCALE))}
            aria-label="Perkecil"
            className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setOffset({ x: 0, y: 0 });
            }}
            aria-label="Reset zoom"
            className="rounded-lg px-2 py-1 text-xs text-white hover:bg-white/10"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => clamp(s * ZOOM_STEP, MIN_SCALE, MAX_SCALE))}
            aria-label="Perbesar"
            className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10"
          >
            +
          </button>
          {url && (
            <a
              href={url}
              download={current.namaFile}
              className="rounded-lg px-3 py-1 text-sm font-medium text-white hover:bg-white/10"
            >
              Unduh
            </a>
          )}
          {url && annotations.length > 0 && (
            <button
              type="button"
              onClick={() => void handleDownloadWithMarkup()}
              disabled={flattening}
              className="rounded-lg px-3 py-1 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {flattening ? "Memproses…" : "Unduh dengan markup"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onIndexChange(clamp(index - 1, 0, attachments.length - 1))}
            disabled={index === 0}
            aria-label="Sebelumnya"
            className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onIndexChange(clamp(index + 1, 0, attachments.length - 1))}
            disabled={index === attachments.length - 1}
            aria-label="Berikutnya"
            className="rounded-lg px-2 py-1 text-sm text-white hover:bg-white/10 disabled:opacity-30"
          >
            →
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="rounded-lg px-3 py-1 text-sm font-medium text-white hover:bg-white/10"
          >
            Tutup
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {!url ? (
          <p className="flex h-full items-center justify-center text-sm text-zinc-300">Memuat…</p>
        ) : (
          <div
            ref={stageRef}
            className="flex h-full w-full items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={() => {
              if (tool !== "pan" && tool !== "select") return;
              setScale((s) => (s === 1 ? 2 : 1));
              setOffset({ x: 0, y: 0 });
            }}
          >
            <div ref={contentRef} className="relative inline-block" style={{ transform }}>
              {current.tipe === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed, expiring API URL
                <img
                  src={url}
                  alt={current.namaFile}
                  onError={refresh}
                  draggable={false}
                  className="block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-2rem)] select-none"
                  style={{ cursor: tool === "pan" && scale > 1 ? "grab" : "default" }}
                />
              ) : (
                <PdfPageCanvas
                  url={url}
                  pageNumber={pageNumber}
                  onBoxChange={handleBoxChange}
                  onPageCountChange={setPageCount}
                />
              )}
              {box && (
                <AnnotationLayer
                  box={box}
                  annotations={annotations.filter((a) => a.pageNumber === pageNumber)}
                  tool={canDraw ? tool : "select"}
                  color={color}
                  onCreateShape={(kind, geometry) => void handleCreateShape(kind, geometry)}
                  onCreateText={(geometry, text) => void handleCreateText(geometry, text)}
                  onUpdateText={(annotationId, text) => void handleUpdateText(annotationId, text)}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  canEdit={(a) => canEditAnnotation(currentUser.peran, a.authorId, currentUser.id)}
                  onDelete={(id) => void handleDeleteAnnotation(id)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawAnnotationsOnCanvas(ctx: CanvasRenderingContext2D, annotations: Annotation[], box: PageBox) {
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
