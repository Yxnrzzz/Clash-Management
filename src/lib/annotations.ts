/**
 * Coordinate normalization for markup: geometry is stored as fractions of
 * the page's intrinsic box (x/y in [0,1] of width/height, origin top-left),
 * not raw pixels. That one mapping stays exact at any zoom level or
 * viewport size — multiply by the currently-rendered box (PageBox) to get
 * pixels, divide to go back. Shared by the SVG overlay renderer and the
 * "download with markup" canvas flattener so the two can never drift.
 *
 * strokeWidth/TEXT size are normalized by page WIDTH only (a single
 * scalar) — normalizing by width and height independently would stretch
 * strokes on a non-square page.
 */

export type AnnotationKind = "RECT" | "ARROW" | "FREEHAND" | "TEXT";

export interface PageBox {
  width: number;
  height: number;
}

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrowGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FreehandGeometry {
  points: [number, number][];
}

export interface TextGeometry {
  x: number;
  y: number;
  size: number;
}

export type Geometry = RectGeometry | ArrowGeometry | FreehandGeometry | TextGeometry;

export interface Annotation {
  id: string;
  attachmentId: string;
  pageNumber: number;
  authorId: string;
  kind: AnnotationKind;
  geometry: Geometry;
  color: string;
  strokeWidth: number;
  text: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PixelShape =
  | { kind: "RECT"; x: number; y: number; w: number; h: number }
  | { kind: "ARROW"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "FREEHAND"; points: [number, number][] }
  | { kind: "TEXT"; x: number; y: number; size: number };

/** Normalized [0,1] geometry → pixels in the currently-rendered PageBox. */
export function toPixels(annotation: Pick<Annotation, "kind" | "geometry">, box: PageBox): PixelShape {
  const { kind, geometry } = annotation;
  switch (kind) {
    case "RECT": {
      const g = geometry as RectGeometry;
      return { kind, x: g.x * box.width, y: g.y * box.height, w: g.w * box.width, h: g.h * box.height };
    }
    case "ARROW": {
      const g = geometry as ArrowGeometry;
      return {
        kind,
        x1: g.x1 * box.width,
        y1: g.y1 * box.height,
        x2: g.x2 * box.width,
        y2: g.y2 * box.height,
      };
    }
    case "FREEHAND": {
      const g = geometry as FreehandGeometry;
      return { kind, points: g.points.map(([x, y]) => [x * box.width, y * box.height]) };
    }
    case "TEXT": {
      const g = geometry as TextGeometry;
      return { kind, x: g.x * box.width, y: g.y * box.height, size: g.size * box.width };
    }
  }
}

/** Pixels in the currently-rendered PageBox → normalized [0,1] geometry. */
export function fromPixels(shape: PixelShape, box: PageBox): Geometry {
  switch (shape.kind) {
    case "RECT":
      return {
        x: shape.x / box.width,
        y: shape.y / box.height,
        w: shape.w / box.width,
        h: shape.h / box.height,
      };
    case "ARROW":
      return {
        x1: shape.x1 / box.width,
        y1: shape.y1 / box.height,
        x2: shape.x2 / box.width,
        y2: shape.y2 / box.height,
      };
    case "FREEHAND":
      return { points: shape.points.map(([x, y]) => [x / box.width, y / box.height]) };
    case "TEXT":
      return { x: shape.x / box.width, y: shape.y / box.height, size: shape.size / box.width };
  }
}

/** Normalized strokeWidth (fraction of width) → px in the current PageBox. */
export function strokeWidthPixels(strokeWidth: number, box: PageBox): number {
  return strokeWidth * box.width;
}

/**
 * The two back-edge points of an arrowhead at (x2,y2), pointing away from
 * (x1,y1) — shared by the SVG renderer (AnnotationLayer) and the "download
 * with markup" canvas flattener so the two can never draw different-looking
 * arrows.
 */
export function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidthPx: number
): [[number, number], [number, number]] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(strokeWidthPx * 3, 8);
  const headAngle = Math.PI / 7;
  return [
    [x2 - headLength * Math.cos(angle - headAngle), y2 - headLength * Math.sin(angle - headAngle)],
    [x2 - headLength * Math.cos(angle + headAngle), y2 - headLength * Math.sin(angle + headAngle)],
  ];
}

/**
 * Ramer–Douglas–Peucker simplification, run client-side before a freehand
 * stroke is sent to the server — a raw pointer-move stream easily produces
 * 500+ points per stroke at 60Hz, which the server caps at 2000 anyway.
 * `epsilon` is in the same normalized [0,1] units as the points themselves.
 */
export function simplifyFreehand(points: [number, number][], epsilon = 0.004): [number, number][] {
  if (points.length <= 2) return points;

  function perpendicularDistance(
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number]
  ): number {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / lengthSq;
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(x - projX, y - projY);
  }

  function rdp(pts: [number, number][]): [number, number][] {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let maxIndex = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const dist = perpendicularDistance(pts[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist > epsilon) {
      const left = rdp(pts.slice(0, maxIndex + 1));
      const right = rdp(pts.slice(maxIndex));
      return [...left.slice(0, -1), ...right];
    }
    return [first, last];
  }

  return rdp(points);
}
