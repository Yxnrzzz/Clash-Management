import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { AnnotationLayer } from "./AnnotationLayer";
import type { Annotation, PageBox } from "@/lib/annotations";

const BOX: PageBox = { width: 800, height: 600 };

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "ann-1",
    attachmentId: "att-1",
    pageNumber: 1,
    authorId: "u-eng-1",
    kind: "RECT",
    geometry: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    color: "#ef4444",
    strokeWidth: 0.004,
    text: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderLayer(overrides: Partial<Parameters<typeof AnnotationLayer>[0]> = {}) {
  const onCreateShape = vi.fn();
  const onCreateText = vi.fn();
  const onUpdateText = vi.fn();
  const onSelect = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <div style={{ position: "relative", width: BOX.width, height: BOX.height }}>
      <AnnotationLayer
        box={BOX}
        annotations={[]}
        tool="select"
        color="#ef4444"
        onCreateShape={onCreateShape}
        onCreateText={onCreateText}
        onUpdateText={onUpdateText}
        selectedId={null}
        onSelect={onSelect}
        canEdit={() => true}
        onDelete={onDelete}
        {...overrides}
      />
    </div>
  );
  return { onCreateShape, onCreateText, onUpdateText, onSelect, onDelete, ...utils };
}

describe("AnnotationLayer rendering", () => {
  it("renders a <rect> with pixel attributes derived from normalized geometry", () => {
    const { container } = renderLayer({ annotations: [makeAnnotation()] });
    const rect = container.querySelector('rect[data-annotation-id="ann-1"]');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute("x")).toBe("80");
    expect(rect?.getAttribute("y")).toBe("120");
    expect(rect?.getAttribute("width")).toBe("240");
    expect(rect?.getAttribute("height")).toBe("240");
  });

  it("renders a <path> for a FREEHAND annotation with pixel points", () => {
    const { container } = renderLayer({
      annotations: [
        makeAnnotation({
          id: "ann-fh",
          kind: "FREEHAND",
          geometry: {
            points: [
              [0, 0],
              [0.5, 0.5],
            ],
          },
        }),
      ],
    });
    const path = container.querySelector('path[data-annotation-id="ann-fh"]');
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBe("M0,0 L400,300");
  });

  it("renders a <text> for a TEXT annotation with pixel position and size", () => {
    const { container } = renderLayer({
      annotations: [
        makeAnnotation({
          id: "ann-txt",
          kind: "TEXT",
          geometry: { x: 0.1, y: 0.1, size: 0.02 },
          text: "Perhatikan di sini",
        }),
      ],
    });
    const text = container.querySelector('text[data-annotation-id="ann-txt"]');
    expect(text).not.toBeNull();
    expect(text?.getAttribute("x")).toBe("80");
    expect(text?.getAttribute("font-size")).toBe("16");
    // textContent also includes the <title> tooltip child (accessibility
    // hint for double-click-to-edit) — assert the visible label separately.
    expect(text?.querySelector("title")?.textContent).toBe("Klik dua kali untuk mengubah teks");
    expect(text?.textContent).toContain("Perhatikan di sini");
  });
});

describe("AnnotationLayer focus handling", () => {
  // Regression: with a real mouse, mousedown's default action moves focus to
  // <body> *after* React has already mounted (and autoFocused) the text
  // input, blurring it in the same tick so onBlur committed an empty value
  // and closed it — text could never be typed. Synthetic events have no
  // default action, so only this assertion catches it.
  it.each(["TEXT", "select", "RECT"] as const)(
    "prevents mousedown's default focus shift in %s mode",
    (tool) => {
      const { container } = renderLayer({ tool });
      const svg = container.querySelector("svg")!;
      // fireEvent returns false when the handler called preventDefault().
      expect(fireEvent.mouseDown(svg, { clientX: 100, clientY: 100 })).toBe(false);
    }
  );

  it("keeps the text input mounted after a click that would otherwise blur it", () => {
    const { container } = renderLayer({ tool: "TEXT" });
    const svg = container.querySelector("svg")!;

    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100 });
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });

    expect(container.querySelector("input")).not.toBeNull();
  });

  it("commits a pending label instead of dropping it when a second one is placed", () => {
    const { container, onCreateText } = renderLayer({ tool: "TEXT" });
    const svg = container.querySelector("svg")!;

    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Label pertama" } });

    // Second placement, without ever blurring the first input.
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 200, pointerId: 1 });

    expect(onCreateText).toHaveBeenCalledTimes(1);
    expect(onCreateText.mock.calls[0][1]).toBe("Label pertama");
  });
});

describe("AnnotationLayer text editing", () => {
  it("double-clicking an editable TEXT annotation opens an input pre-filled with its current text", () => {
    const { container } = renderLayer({
      annotations: [makeAnnotation({ id: "ann-txt", kind: "TEXT", geometry: { x: 0.1, y: 0.1, size: 0.02 }, text: "Lama" })],
      canEdit: () => true,
    });
    const text = container.querySelector('text[data-annotation-id="ann-txt"]')!;

    fireEvent.doubleClick(text);

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Lama");
  });

  it("pressing Enter commits the edited text via onUpdateText", () => {
    const { container, onUpdateText } = renderLayer({
      annotations: [makeAnnotation({ id: "ann-txt", kind: "TEXT", geometry: { x: 0.1, y: 0.1, size: 0.02 }, text: "Lama" })],
      canEdit: () => true,
    });
    const text = container.querySelector('text[data-annotation-id="ann-txt"]')!;
    fireEvent.doubleClick(text);

    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Baru" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdateText).toHaveBeenCalledWith("ann-txt", "Baru");
  });

  it("does not offer double-click-to-edit when the viewer cannot edit the annotation", () => {
    const { container, onUpdateText } = renderLayer({
      annotations: [makeAnnotation({ id: "ann-txt", kind: "TEXT", geometry: { x: 0.1, y: 0.1, size: 0.02 }, text: "Lama" })],
      canEdit: () => false,
    });
    const text = container.querySelector('text[data-annotation-id="ann-txt"]')!;

    fireEvent.doubleClick(text);

    expect(container.querySelector("input")).toBeNull();
    expect(onUpdateText).not.toHaveBeenCalled();
  });

  it("Escape cancels the edit without calling onUpdateText", () => {
    const { container, onUpdateText } = renderLayer({
      annotations: [makeAnnotation({ id: "ann-txt", kind: "TEXT", geometry: { x: 0.1, y: 0.1, size: 0.02 }, text: "Lama" })],
      canEdit: () => true,
    });
    const text = container.querySelector('text[data-annotation-id="ann-txt"]')!;
    fireEvent.doubleClick(text);

    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Baru" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(container.querySelector("input")).toBeNull();
    expect(onUpdateText).not.toHaveBeenCalled();
  });
});

describe("AnnotationLayer drawing", () => {
  it("emits normalized RECT geometry in [0,1] after a pointerdown→move→up drag", () => {
    const { container, onCreateShape } = renderLayer({ tool: "RECT" });
    const svg = container.querySelector("svg")!;

    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 300, pointerId: 1 });

    expect(onCreateShape).toHaveBeenCalledTimes(1);
    const [kind, geometry] = onCreateShape.mock.calls[0];
    expect(kind).toBe("RECT");
    expect(geometry.x).toBeCloseTo(100 / 800, 5);
    expect(geometry.y).toBeCloseTo(100 / 600, 5);
    expect(geometry.w).toBeCloseTo(200 / 800, 5);
    expect(geometry.h).toBeCloseTo(200 / 600, 5);
  });

  it("does not emit a shape for a drag smaller than the minimum threshold", () => {
    const { container, onCreateShape } = renderLayer({ tool: "RECT" });
    const svg = container.querySelector("svg")!;

    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 101, clientY: 101, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 101, clientY: 101, pointerId: 1 });

    expect(onCreateShape).not.toHaveBeenCalled();
  });
});

describe("AnnotationLayer delete affordance", () => {
  it("shows the delete handle when the viewer can edit the selected annotation", () => {
    const { container } = renderLayer({
      annotations: [makeAnnotation()],
      selectedId: "ann-1",
      canEdit: () => true,
    });
    expect(container.querySelector('button[aria-label="Hapus markup ann-1"]')).not.toBeNull();
  });

  it("hides the delete handle for a non-author Engineer", () => {
    const { container } = renderLayer({
      annotations: [makeAnnotation({ authorId: "u-eng-1" })],
      selectedId: "ann-1",
      canEdit: () => false,
    });
    expect(container.querySelector('button[aria-label="Hapus markup ann-1"]')).toBeNull();
  });

  it("hides the delete handle when nothing is selected", () => {
    const { container } = renderLayer({
      annotations: [makeAnnotation()],
      selectedId: null,
      canEdit: () => true,
    });
    expect(container.querySelector('button[aria-label="Hapus markup ann-1"]')).toBeNull();
  });
});
