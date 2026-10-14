import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { step } from "./riser.js";

/** The horizontal direction a face looks in, or null for a face that is not vertical. */
function facing([a, b, , d]: readonly Vector3[]): Vector3 | null {
  const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
  return Math.abs(normal.y) > 1e-9 ? null : normal;
}

describe("step", () => {
  const lower = new Vector3(0, 1, 0);
  const higher = new Vector3(1, 3, 1);

  for (const [name, p, q] of [
    ["up", lower, higher],
    ["down", higher, lower],
  ] as const) {
    it(`makes the riser of a diagonal step ${name} from vertical faces that look in two directions`, () => {
      const { near, far, risers } = step(p, q);
      expect(risers).toHaveLength(4);
      const normals = risers.map(facing);
      expect(normals.every((n) => n !== null)).toBe(true);
      // Two faces that are not parallel: no view along the ground has all of
      // them edge-on.
      const crossings = normals.flatMap((a, i) =>
        normals.slice(i + 1).map((b) => a && b && a.clone().cross(b).length()),
      );
      expect(Math.max(...crossings.map((c) => c ?? 0))).toBeGreaterThan(0.99);
      // Each face goes from one height to the other.
      for (const face of risers) {
        expect(Math.min(...face.map((c) => c.y))).toBe(Math.min(p.y, q.y));
        expect(Math.max(...face.map((c) => c.y))).toBe(Math.max(p.y, q.y));
      }
      expect(near.y).toBe(p.y);
      expect(far.y).toBe(q.y);
    });
  }

  it("keeps the riser off the higher square, over the lower one", () => {
    // The squares are 1 unit apart on x, with the edge between them at x = 0.5.
    const { risers } = step(new Vector3(0, 1, 0), new Vector3(1, 3, 0));
    const xs = risers.flatMap((face) => face.map((c) => c.x));
    // The side of the box nearest the higher column is 0.02 over the lower square.
    expect(Math.max(...xs)).toBeCloseTo(0.48);
    expect(Math.min(...xs)).toBeCloseTo(0.38);
  });
});
