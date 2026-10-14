import { describe, expect, it } from "vitest";
import {
  dragRoute,
  findPath,
  isRoute,
  routeLabel,
  STEP_FEET,
  type Grid,
} from "./path.js";
import type { Square } from "./scene.js";

/** A grid of this size with these squares blocked. */
function grid(width: number, depth: number, blocked: Square[] = []): Grid {
  const keys = new Set(blocked.map(({ x, z }) => `${x},${z}`));
  return { width, depth, blocked: (x, z) => keys.has(`${x},${z}`) };
}

const sq = (x: number, z: number): Square => ({ x, z });

/**
 * The feet of `squares` as a route by the 3.5e rules, after a check that
 * each step goes to one of the eight squares around and to a square that is
 * not blocked.
 */
function walk(g: Grid, squares: Square[]): number {
  let feet = 0;
  let diagonals = 0;
  for (let i = 1; i < squares.length; i++) {
    const a = squares[i - 1];
    const b = squares[i];
    const dx = Math.abs(b.x - a.x);
    const dz = Math.abs(b.z - a.z);
    expect(Math.max(dx, dz)).toBe(1);
    expect(g.blocked(b.x, b.z)).toBe(false);
    if (dx && dz) {
      diagonals++;
      feet += diagonals % 2 === 0 ? 2 * STEP_FEET : STEP_FEET;
    } else {
      feet += STEP_FEET;
    }
  }
  return feet;
}

/**
 * The least feet from `from` to `to`, found another way: each (square, odd or
 * even count of diagonal steps) gets a lower cost from its neighbours until
 * no cost changes.
 */
function leastFeet(g: Grid, from: Square, to: Square): number | null {
  const key = (x: number, z: number, odd: number) =>
    (z * g.width + x) * 2 + odd;
  const cost = new Array<number>(g.width * g.depth * 2).fill(Infinity);
  cost[key(from.x, from.z, 0)] = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let z = 0; z < g.depth; z++) {
      for (let x = 0; x < g.width; x++) {
        for (const odd of [0, 1]) {
          const here = cost[key(x, z, odd)];
          if (here === Infinity) continue;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const [nx, nz] = [x + dx, z + dz];
              if ((!dx && !dz) || nx < 0 || nz < 0) continue;
              if (nx >= g.width || nz >= g.depth || g.blocked(nx, nz)) continue;
              const diagonal = dx !== 0 && dz !== 0;
              const step = diagonal && odd ? 2 * STEP_FEET : STEP_FEET;
              const next = key(nx, nz, diagonal ? 1 - odd : odd);
              if (here + step < cost[next]) {
                cost[next] = here + step;
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  const best = Math.min(cost[key(to.x, to.z, 0)], cost[key(to.x, to.z, 1)]);
  return best === Infinity ? null : best;
}

/** A seeded random number in [0, 1) (mulberry32), so a failure repeats. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("findPath", () => {
  it("gives the start square and 0 ft for a move to the start square", () => {
    expect(findPath(grid(3, 3), sq(1, 1), sq(1, 1))).toEqual({
      squares: [sq(1, 1)],
      feet: 0,
    });
  });

  it("goes in a straight line at 5 ft a step", () => {
    expect(findPath(grid(8, 3), sq(1, 1), sq(5, 1))).toEqual({
      squares: [sq(1, 1), sq(2, 1), sq(3, 1), sq(4, 1), sq(5, 1)],
      feet: 20,
    });
  });

  it("counts 1, 2 and 3 diagonal steps as 5, 15 and 20 ft", () => {
    const g = grid(5, 5);
    expect(findPath(g, sq(0, 0), sq(1, 1))?.feet).toBe(5);
    // Two diagonal steps and a diagonal step with two straight steps both cost
    // 15 ft. Of the equal routes, the one with the fewest steps wins.
    expect(findPath(g, sq(0, 0), sq(2, 2))).toEqual({
      squares: [sq(0, 0), sq(1, 1), sq(2, 2)],
      feet: 15,
    });
    expect(findPath(g, sq(0, 0), sq(3, 3))).toEqual({
      squares: [sq(0, 0), sq(1, 1), sq(2, 2), sq(3, 3)],
      feet: 20,
    });
  });

  it("adds straight steps to diagonal steps by the 3.5e rule", () => {
    // 3 diagonal steps (20 ft) and 3 straight steps (15 ft).
    const route = findPath(grid(8, 5), sq(0, 0), sq(6, 3));
    expect(route?.feet).toBe(35);
    expect(route?.squares).toHaveLength(7);
  });

  it("goes around a wall of occupied squares", () => {
    // A wall on x = 2 from z = 0 to z = 3: the route goes through [2, 4].
    const wall = [sq(2, 0), sq(2, 1), sq(2, 2), sq(2, 3)];
    const g = grid(5, 5, wall);
    const route = findPath(g, sq(0, 0), sq(4, 0));
    expect(route?.feet).toBe(50);
    expect(route?.squares).toContainEqual(sq(2, 4));
    expect(walk(g, route?.squares ?? [])).toBe(50);
  });

  it("takes a diagonal step between two occupied squares", () => {
    const g = grid(2, 2, [sq(1, 0), sq(0, 1)]);
    expect(findPath(g, sq(0, 0), sq(1, 1))).toEqual({
      squares: [sq(0, 0), sq(1, 1)],
      feet: 5,
    });
  });

  it("starts on an occupied start square", () => {
    const g = grid(3, 1, [sq(0, 0)]);
    expect(findPath(g, sq(0, 0), sq(2, 0))?.feet).toBe(10);
  });

  it("finds no route to a square closed in by occupied squares", () => {
    const ring = [-1, 0, 1].flatMap((dz) =>
      [-1, 0, 1].filter((dx) => dx || dz).map((dx) => sq(2 + dx, 2 + dz)),
    );
    expect(findPath(grid(5, 5, ring), sq(0, 0), sq(2, 2))).toBeNull();
  });

  it("finds no route to an occupied square or off the board", () => {
    const g = grid(3, 3, [sq(2, 2)]);
    expect(findPath(g, sq(0, 0), sq(2, 2))).toBeNull();
    expect(findPath(g, sq(0, 0), sq(3, 0))).toBeNull();
  });

  it("gives the least feet, as another search does, on random boards", () => {
    const next = random(6);
    for (let round = 0; round < 40; round++) {
      const width = 3 + Math.floor(next() * 6);
      const depth = 3 + Math.floor(next() * 6);
      const blocked: Square[] = [];
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          if (next() < 0.3) blocked.push(sq(x, z));
        }
      }
      const g = grid(width, depth, blocked);
      const pick = () =>
        sq(Math.floor(next() * width), Math.floor(next() * depth));
      const [from, to] = [pick(), pick()];
      const route = findPath(g, from, to);
      const least = g.blocked(to.x, to.z) ? null : leastFeet(g, from, to);
      if (from.x === to.x && from.z === to.z) continue;
      expect(route?.feet ?? null).toBe(least);
      if (!route) continue;
      expect(route.squares[0]).toEqual(from);
      expect(route.squares.at(-1)).toEqual(to);
      expect(walk(g, route.squares)).toBe(route.feet);
    }
  });
});

describe("dragRoute, isRoute and routeLabel", () => {
  const ring = [sq(3, 0), sq(3, 1), sq(4, 1)];
  const g = grid(5, 3, [sq(1, 1), ...ring]);
  const from = sq(0, 0);

  it("shows the route and its feet for a free square it can reach", () => {
    const route = dragRoute(g, from, sq(2, 2));
    expect(route).toEqual(findPath(g, from, sq(2, 2)));
    expect(isRoute(route)).toBe(true);
    expect(routeLabel(route)).toBe("15 ft");
  });

  it("says No path for a free square it cannot reach", () => {
    const route = dragRoute(g, from, sq(4, 0));
    expect(route).toBe("none");
    expect(isRoute(route)).toBe(false);
    expect(routeLabel(route)).toBe("No path");
  });

  it("shows nothing for an occupied square, the start square or off the board", () => {
    for (const to of [sq(1, 1), from, null, sq(5, 0), sq(0.5, 0)]) {
      expect(dragRoute(g, from, to)).toBeNull();
    }
    expect(isRoute(null)).toBe(false);
    expect(routeLabel(null)).toBeNull();
  });
});
