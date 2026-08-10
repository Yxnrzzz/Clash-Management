import { describe, expect, it } from "vitest";
import {
  fromPixels,
  simplifyFreehand,
  strokeWidthPixels,
  toPixels,
  type Annotation,
  type PageBox,
} from "./annotations";

const BOXES: PageBox[] = [
  { width: 800, height: 600 },
  { width: 1200, height: 300 },
  { width: 375, height: 812 },
];

describe("toPixels / fromPixels round-trip", () => {
  it("round-trips a RECT at several box sizes", () => {
    const annotation: Pick<Annotation, "kind" | "geometry"> = {
      kind: "RECT",
      geometry: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    };
    for (const box of BOXES) {
      const px = toPixels(annotation, box);
      const back = fromPixels(px, box);
      expect(back).toMatchObject({
        x: expect.closeTo(0.1, 6),
        y: expect.closeTo(0.2, 6),
        w: expect.closeTo(0.3, 6),
        h: expect.closeTo(0.4, 6),
      });
    }
  });

  it("round-trips an ARROW", () => {
    const annotation: Pick<Annotation, "kind" | "geometry"> = {
      kind: "ARROW",
      geometry: { x1: 0.05, y1: 0.95, x2: 0.5, y2: 0.5 },
    };
    for (const box of BOXES) {
      const back = fromPixels(toPixels(annotation, box), box);
      expect(back).toMatchObject({
        x1: expect.closeTo(0.05, 6),
        y1: expect.closeTo(0.95, 6),
        x2: expect.closeTo(0.5, 6),
        y2: expect.closeTo(0.5, 6),
      });
    }
  });

  it("round-trips a FREEHAND stroke", () => {
    const annotation: Pick<Annotation, "kind" | "geometry"> = {
      kind: "FREEHAND",
      geometry: {
        points: [
          [0.1, 0.1],
          [0.2, 0.3],
          [0.4, 0.2],
        ],
      },
    };
    for (const box of BOXES) {
      const back = fromPixels(toPixels(annotation, box), box);
      if ("points" in back) {
        back.points.forEach(([x, y], i) => {
          const [ox, oy] = (annotation.geometry as { points: [number, number][] }).points[i];
          expect(x).toBeCloseTo(ox, 6);
          expect(y).toBeCloseTo(oy, 6);
        });
      } else {
        throw new Error("expected FREEHAND geometry");
      }
    }
  });

  it("round-trips TEXT including size", () => {
    const annotation: Pick<Annotation, "kind" | "geometry"> = {
      kind: "TEXT",
      geometry: { x: 0.3, y: 0.4, size: 0.02 },
    };
    for (const box of BOXES) {
      const back = fromPixels(toPixels(annotation, box), box);
      expect(back).toMatchObject({
        x: expect.closeTo(0.3, 6),
        y: expect.closeTo(0.4, 6),
        size: expect.closeTo(0.02, 6),
      });
    }
  });

  it("scales strokeWidth by width only, not height, so lines stay uniform on non-square pages", () => {
    const wide: PageBox = { width: 1000, height: 200 };
    const tall: PageBox = { width: 1000, height: 2000 };
    // Same width, different height — pixel stroke width must match.
    expect(strokeWidthPixels(0.004, wide)).toBe(strokeWidthPixels(0.004, tall));
    expect(strokeWidthPixels(0.004, wide)).toBe(4);
  });
});

describe("simplifyFreehand", () => {
  it("keeps the first and last point", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.1, 0.1],
      [0.2, 0.05],
      [0.3, 0.2],
      [0.4, 0.15],
      [0.5, 0.5],
    ];
    const simplified = simplifyFreehand(points, 0.02);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("reduces point count for a near-straight line", () => {
    const points: [number, number][] = Array.from({ length: 50 }, (_, i) => [i / 49, i / 49]);
    const simplified = simplifyFreehand(points, 0.01);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified.length).toBeGreaterThanOrEqual(2);
  });

  it("returns the input unchanged when it has 2 or fewer points", () => {
    const points: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    expect(simplifyFreehand(points)).toEqual(points);
  });

  it("preserves a sharp corner that exceeds epsilon", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.5, 0],
      [0.5, 0.5],
    ];
    const simplified = simplifyFreehand(points, 0.01);
    expect(simplified).toContainEqual([0.5, 0]);
  });
});
