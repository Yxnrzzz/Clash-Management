"use client";

import type { AnnotationTool } from "./AnnotationLayer";

// "select" and "pan" are viewing affordances available to every role
// (including read-only Management, which needs drag-to-pan on a zoomed
// image); the drawing tools and color picker are writes, gated by canDraw.
const VIEW_TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "select", label: "Pilih" },
  { id: "pan", label: "Geser" },
];

const DRAW_TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "RECT", label: "Kotak" },
  { id: "ARROW", label: "Panah" },
  { id: "FREEHAND", label: "Bebas" },
  { id: "TEXT", label: "Teks" },
];

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  canDraw,
}: {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  canDraw: boolean;
}) {
  const tools = canDraw ? [...VIEW_TOOLS, ...DRAW_TOOLS] : VIEW_TOOLS;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-black/40 p-1">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onToolChange(t.id)}
          aria-pressed={tool === t.id}
          className={`rounded px-2 py-1 text-xs font-medium ${
            tool === t.id ? "bg-white text-zinc-900" : "text-white hover:bg-white/10"
          }`}
        >
          {t.label}
        </button>
      ))}
      {canDraw && (
        <>
          <div className="mx-1 h-4 w-px bg-white/30" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Warna ${c}`}
              aria-pressed={color === c}
              onClick={() => onColorChange(c)}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </>
      )}
    </div>
  );
}
