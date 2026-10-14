import { Vector3, type BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import type { Board, Square } from "../shared/scene.js";
import { columnTop } from "./board.js";
import { pathGeometry } from "./pathgeometry.js";

/** The line is this far above the tops (RAISE in pathgeometry.ts). */
const RAISE = 0.03;
/** Half the width of the line (WIDTH / 2 in pathgeometry.ts). */
const HALF = 0.05;
/** The space between a riser and the higher column (EDGE_GAP in pathgeometry.ts). */
const GAP = 0.02;

/** A board of these height rows, all stone. */
function board(heights: string[]): Board {
  return {
    width: heights[0].length,
    depth: heights.length,
    materials: { s: { name: "stone", top: "#888888", side: "#666666" } },
    heights,
    tiles: heights.map((row) => "s".repeat(row.length)),
  };
}

interface Quad {
  corners: Vector3[];
  normal: Vector3;
}

/** The quads of a route geometry: each four vertices, in order, make one. */
function quads(geometry: BufferGeometry): Quad[] {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const out: Quad[] = [];
  for (let i = 0; i < position.count; i += 4) {
    out.push({
      corners: [0, 1, 2, 3].map((k) =>
        new Vector3().fromBufferAttribute(position, i + k),
      ),
      normal: new Vector3().fromBufferAttribute(normal, i),
    });
  }
  return out;
}

/** The point of the line on the top of `square`: where its dot is centred. */
function top(b: Board, { x, z }: Square): Vector3 {
  return new Vector3(
    x + 0.5,
    columnTop(Number(b.heights[z][x])) + RAISE,
    z + 0.5,
  );
}

const near = (a: Vector3, b: Vector3): boolean => a.distanceTo(b) < 1e-5;
const isUp = (q: Quad): boolean => near(q.normal, new Vector3(0, 1, 0));
const risers = (all: Quad[]): Quad[] =>
  all.filter((q) => Math.abs(q.normal.y) < 1e-9);

describe("pathGeometry", () => {
  const FLAT = board(["000", "000", "000"]);
  const route: Square[] = [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 2, z: 1 },
  ];

  it("puts a flat dot on each square of the route", () => {
    const all = quads(pathGeometry(FLAT, route));
    for (const square of route) {
      const centre = top(FLAT, square);
      const dot = all.filter((q) => q.corners.some((c) => near(c, centre)));
      expect(dot.length).toBeGreaterThan(0);
      for (const q of dot) {
        expect(isUp(q)).toBe(true);
        for (const c of q.corners) {
          expect(c.y).toBeCloseTo(centre.y, 5);
          expect(c.distanceTo(centre)).toBeLessThanOrEqual(0.15 + 1e-5);
        }
      }
    }
    expect(risers(all)).toEqual([]);
  });

  it("joins two squares at the same height with a flat strip as wide as the line", () => {
    const all = quads(pathGeometry(FLAT, route));
    const centres = route.map((s) => top(FLAT, s));
    const strips = all.filter(
      (q) => !q.corners.some((c) => centres.some((m) => near(c, m))),
    );
    expect(strips).toHaveLength(route.length - 1);
    strips.forEach((strip, i) => {
      const [p, q] = [centres[i], centres[i + 1]];
      const way = q.clone().sub(p).normalize();
      expect(isUp(strip)).toBe(true);
      for (const c of strip.corners) {
        const along = c.clone().sub(p).dot(way);
        // Each corner is at p or at q along the way, and half the width to one side.
        expect(
          Math.min(Math.abs(along), Math.abs(along - p.distanceTo(q))),
        ).toBeCloseTo(0, 5);
        const to = c.clone().sub(p).addScaledVector(way, -along);
        expect(to.length()).toBeCloseTo(HALF, 5);
      }
    });
  });

  // [1, 1] is two levels higher than [0, 0], diagonally from it.
  const HILL = board(["00", "02"]);
  const LOW = { x: 0, z: 0 };
  const HIGH = { x: 1, z: 1 };

  for (const [name, squares] of [
    ["up", [LOW, HIGH]],
    ["down", [HIGH, LOW]],
  ] as const) {
    it(`makes the riser of a diagonal step ${name} from faces that look in two directions and span both heights`, () => {
      const faces = risers(quads(pathGeometry(HILL, squares)));
      expect(faces.length).toBeGreaterThan(0);
      // Two faces that are not parallel: no view along the ground has all of
      // them edge-on.
      const crossings = faces.flatMap((a) =>
        faces.map((b) => a.normal.clone().cross(b.normal).length()),
      );
      expect(Math.max(...crossings)).toBeGreaterThan(0.99);
      const [low, high] = [top(HILL, LOW).y, top(HILL, HIGH).y];
      for (const face of faces) {
        const ys = face.corners.map((c) => c.y);
        expect(Math.min(...ys)).toBeCloseTo(low, 5);
        expect(Math.max(...ys)).toBeCloseTo(high, 5);
      }
    });
  }

  it("keeps each riser EDGE_GAP from the higher column on each axis it crosses", () => {
    /** The x and z range of the risers of a route on `b`. */
    const span = (b: Board, squares: Square[]) => {
      const corners = risers(quads(pathGeometry(b, squares))).flatMap(
        (q) => q.corners,
      );
      const xs = corners.map((c) => c.x);
      const zs = corners.map((c) => c.z);
      return {
        x: [Math.min(...xs), Math.max(...xs)],
        z: [Math.min(...zs), Math.max(...zs)],
      };
    };
    const expectSpan = (
      got: { x: number[]; z: number[] },
      want: { x: number[]; z: number[] },
    ): void => {
      for (const axis of ["x", "z"] as const) {
        expect(got[axis][0]).toBeCloseTo(want[axis][0], 5);
        expect(got[axis][1]).toBeCloseTo(want[axis][1], 5);
      }
    };
    const box = (edge: number, way: number): number[] =>
      way < 0
        ? [edge - GAP - 2 * HALF, edge - GAP]
        : [edge + GAP, edge + GAP + 2 * HALF];

    // A straight step up to the higher column on +x: the edge is at x = 1.
    const STEP = board(["02"]);
    const straight = { x: box(1, -1), z: [0.5 - HALF, 0.5 + HALF] };
    expectSpan(span(STEP, [LOW, { x: 1, z: 0 }]), straight);
    expectSpan(span(STEP, [{ x: 1, z: 0 }, LOW]), straight);
    // The higher column on -x: the riser is over [1, 0], on the other side.
    const BACK = board(["20"]);
    expectSpan(span(BACK, [{ x: 1, z: 0 }, LOW]), {
      x: box(1, 1),
      z: [0.5 - HALF, 0.5 + HALF],
    });
    // A diagonal step: the corner is at [1, 1], and the gap is on both axes.
    const diagonal = { x: box(1, -1), z: box(1, -1) };
    expectSpan(span(HILL, [LOW, HIGH]), diagonal);
    expectSpan(span(HILL, [HIGH, LOW]), diagonal);
  });
});
