"use client";

import { useRef, useState } from "react";
import type { Annotation, Geometry, PageBox } from "@/lib/annotations";
import { arrowHeadPoints, fromPixels, simplifyFreehand, strokeWidthPixels, toPixels } from "@/lib/annotations";

export type AnnotationTool = "select" | "pan" | "RECT" | "ARROW" | "FREEHAND" | "TEXT";

type DrawKind = "RECT" | "ARROW" | "FREEHAND";

interface Point {
  x: number;
  y: number;
}

interface Draft {
  kind: DrawKind;
  start: Point;
  current: Point;
  points: Point[];
}

const MIN_DRAG_PX = 3;

interface TextEdit {
  id: string;
  x: number;
  y: number;
  value: string;
}

export function AnnotationLayer({
  box,
  annotations,
  tool,
  color,
  onCreateShape,
  onCreateText,
  onUpdateText,
  selectedId,
  onSelect,
  canEdit,
  onDelete,
}: {
  box: PageBox;
  annotations: Annotation[];
  tool: AnnotationTool;
  color: string;
  onCreateShape: (kind: DrawKind, geometry: Geometry) => void;
  onCreateText: (geometry: Geometry, text: string) => void;
  onUpdateText: (annotationId: string, text: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  canEdit: (annotation: Annotation) => boolean;
  onDelete: (annotationId: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textDraft, setTextDraft] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);

  const isDrawing = tool === "RECT" || tool === "ARROW" || tool === "FREEHAND";
  const isTextTool = tool === "TEXT";

  function pointFromEvent(e: { clientX: number; clientY: number }): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: Math.min(Math.max(e.clientX - left, 0), box.width),
      y: Math.min(Math.max(e.clientY - top, 0), box.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (isTextTool) {
      // Placing a second label without leaving the first: commit the pending
      // one rather than silently discarding it. The blur that would normally
      // trigger commitText can't fire here, because handleMouseDown below
      // suppresses mousedown's focus shift.
      if (textDraft && textValue.trim()) commitText();
      if (textEdit && textEdit.value.trim()) commitTextEdit();
      setTextDraft(pointFromEvent(e));
      setTextValue("");
      return;
    }
    if (!isDrawing) return;
    const p = pointFromEvent(e);
    // jsdom (test environment) doesn't implement pointer capture — harmless
    // to skip there since fireEvent dispatches move/up straight to the
    // element under test regardless.
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    setDraft({ kind: tool as DrawKind, start: p, current: p, points: [p] });
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    const p = pointFromEvent(e);
    setDraft({ ...draft, current: p, points: draft.kind === "FREEHAND" ? [...draft.points, p] : draft.points });
  }

  function handlePointerUp() {
    if (!draft) return;
    finalizeDraft(draft);
    setDraft(null);
  }

  /**
   * Suppresses mousedown's default action, whose only effect here is to move
   * focus to <body>. That matters because the text input this layer opens
   * (on a TEXT-tool click, or a double-click on an existing label) mounts
   * during React's commit — which runs *inside* the mousedown dispatch,
   * before the browser performs that focus shift. Without this, the input
   * appeared and was blurred in the same tick, and its onBlur committed an
   * empty value and closed it again, so text could never be typed at all.
   *
   * Synthetic events dispatched from a test or the console have no default
   * action, which is why this only ever reproduced with a real mouse.
   */
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
  }

  function finalizeDraft(d: Draft) {
    if (d.kind === "RECT") {
      const x = Math.min(d.start.x, d.current.x);
      const y = Math.min(d.start.y, d.current.y);
      const w = Math.abs(d.current.x - d.start.x);
      const h = Math.abs(d.current.y - d.start.y);
      if (w >= MIN_DRAG_PX && h >= MIN_DRAG_PX) {
        onCreateShape("RECT", fromPixels({ kind: "RECT", x, y, w, h }, box));
      }
      return;
    }
    if (d.kind === "ARROW") {
      const dist = Math.hypot(d.current.x - d.start.x, d.current.y - d.start.y);
      if (dist >= MIN_DRAG_PX) {
        onCreateShape(
          "ARROW",
          fromPixels({ kind: "ARROW", x1: d.start.x, y1: d.start.y, x2: d.current.x, y2: d.current.y }, box)
        );
      }
      return;
    }
    if (d.points.length > 1) {
      const normalized = d.points.map(({ x, y }) => [x / box.width, y / box.height] as [number, number]);
      onCreateShape("FREEHAND", { points: simplifyFreehand(normalized) });
    }
  }

  function commitText() {
    if (textDraft && textValue.trim()) {
      const geometry = fromPixels(
        { kind: "TEXT", x: textDraft.x, y: textDraft.y, size: box.width * 0.02 },
        box
      );
      onCreateText(geometry, textValue.trim());
    }
    setTextDraft(null);
    setTextValue("");
  }

  function commitTextEdit() {
    if (textEdit && textEdit.value.trim()) {
      onUpdateText(textEdit.id, textEdit.value.trim());
    }
    setTextEdit(null);
  }

  return (
    <>
      <svg
        ref={svgRef}
        width={box.width}
        height={box.height}
        className="absolute inset-0"
        style={{
          pointerEvents: tool === "pan" ? "none" : "auto",
          cursor: isDrawing || isTextTool ? "crosshair" : "default",
        }}
        onMouseDown={handleMouseDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => {
          if (tool === "select" && e.target === svgRef.current) onSelect(null);
        }}
      >
        {annotations.map((a) => (
          <AnnotationShape
            key={a.id}
            annotation={a}
            box={box}
            selected={a.id === selectedId}
            interactive={tool === "select"}
            onSelect={() => onSelect(a.id)}
            onEditText={
              canEdit(a)
                ? () => {
                    const shape = toPixels(a, box);
                    if (shape.kind === "TEXT") {
                      setTextEdit({ id: a.id, x: shape.x, y: shape.y, value: a.text ?? "" });
                    }
                  }
                : undefined
            }
          />
        ))}
        {draft && <DraftShape draft={draft} color={color} />}
      </svg>

      {annotations
        .filter((a) => a.id === selectedId && canEdit(a))
        .map((a) => (
          <DeleteHandle key={`del-${a.id}`} annotation={a} box={box} onDelete={() => onDelete(a.id)} />
        ))}

      {textDraft && (
        <div className="absolute z-10" style={{ left: textDraft.x, top: textDraft.y }}>
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") {
                setTextDraft(null);
                setTextValue("");
              }
            }}
            onBlur={commitText}
            placeholder="Tulis catatan…"
            className="rounded border border-zinc-400 bg-white px-2 py-1 text-xs text-zinc-900 shadow"
          />
        </div>
      )}

      {textEdit && (
        <div className="absolute z-10" style={{ left: textEdit.x, top: textEdit.y }}>
          <input
            autoFocus
            value={textEdit.value}
            onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTextEdit();
              if (e.key === "Escape") setTextEdit(null);
            }}
            onBlur={commitTextEdit}
            className="rounded border border-zinc-400 bg-white px-2 py-1 text-xs text-zinc-900 shadow"
          />
        </div>
      )}
    </>
  );
}

function AnnotationShape({
  annotation,
  box,
  selected,
  interactive,
  onSelect,
  onEditText,
}: {
  annotation: Annotation;
  box: PageBox;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onEditText?: () => void;
}) {
  const shape = toPixels(annotation, box);
  const strokeWidthPx = strokeWidthPixels(annotation.strokeWidth, box);
  const commonProps = {
    stroke: annotation.color,
    strokeWidth: strokeWidthPx,
    style: { cursor: interactive ? "pointer" : "default" },
    onClick: (e: React.MouseEvent) => {
      if (!interactive) return;
      e.stopPropagation();
      onSelect();
    },
  };
  const selectionProps = selected ? { strokeDasharray: `${strokeWidthPx * 3} ${strokeWidthPx * 2}` } : {};

  if (shape.kind === "RECT") {
    return (
      <rect
        data-annotation-id={annotation.id}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill="transparent"
        pointerEvents={interactive ? "all" : "none"}
        {...commonProps}
        {...selectionProps}
      />
    );
  }

  if (shape.kind === "ARROW") {
    const [p1, p2] = arrowHeadPoints(shape.x1, shape.y1, shape.x2, shape.y2, strokeWidthPx);
    return (
      <g
        data-annotation-id={annotation.id}
        pointerEvents={interactive ? "all" : "none"}
        {...commonProps}
        {...selectionProps}
      >
        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={annotation.color} strokeWidth={strokeWidthPx} />
        <polygon points={`${shape.x2},${shape.y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={annotation.color} />
      </g>
    );
  }

  if (shape.kind === "FREEHAND") {
    const d = shape.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
    return (
      <path
        data-annotation-id={annotation.id}
        d={d}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents={interactive ? "stroke" : "none"}
        {...commonProps}
        {...selectionProps}
      />
    );
  }

  // TEXT
  return (
    <text
      data-annotation-id={annotation.id}
      x={shape.x}
      y={shape.y + shape.size}
      fontSize={shape.size}
      fill={annotation.color}
      pointerEvents={interactive ? "all" : "none"}
      style={{ cursor: interactive ? "pointer" : "default" }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        if (!interactive || !onEditText) return;
        // Stop the double-click from also reaching the stage's own
        // onDoubleClick (zoom toggle) further up the tree.
        e.stopPropagation();
        onEditText();
      }}
    >
      {interactive && onEditText && <title>Klik dua kali untuk mengubah teks</title>}
      {annotation.text}
    </text>
  );
}

function DraftShape({ draft, color }: { draft: Draft; color: string }) {
  if (draft.kind === "RECT") {
    const x = Math.min(draft.start.x, draft.current.x);
    const y = Math.min(draft.start.y, draft.current.y);
    const w = Math.abs(draft.current.x - draft.start.x);
    const h = Math.abs(draft.current.y - draft.start.y);
    return <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 4" />;
  }
  if (draft.kind === "ARROW") {
    return (
      <line
        x1={draft.start.x}
        y1={draft.start.y}
        x2={draft.current.x}
        y2={draft.current.y}
        stroke={color}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
    );
  }
  const d = draft.points.map(({ x, y }, i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
}

function DeleteHandle({
  annotation,
  box,
  onDelete,
}: {
  annotation: Annotation;
  box: PageBox;
  onDelete: () => void;
}) {
  const shape = toPixels(annotation, box);
  const anchor =
    shape.kind === "RECT"
      ? { x: shape.x + shape.w, y: shape.y }
      : shape.kind === "ARROW"
        ? { x: shape.x2, y: shape.y2 }
        : shape.kind === "TEXT"
          ? { x: shape.x, y: shape.y }
          : { x: shape.points[0][0], y: shape.points[0][1] };

  return (
    <button
      type="button"
      aria-label={`Hapus markup ${annotation.id}`}
      onClick={onDelete}
      className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-700"
      style={{ left: anchor.x, top: anchor.y }}
    >
      ×
    </button>
  );
}
