// The route of a move on the board, by the 3.5e rules. It has no DOM and no
// three.js, so the client, the server and the tests can all use it.
import { onBoard, type Square } from "./scene.js";

/**
 * The squares that a route can use: the size of the board and the squares
 * that it must go around. Height has no part in a route: it does not block a
 * step and it does not cost.
 */
export interface Grid {
  width: number;
  depth: number;
  /** True when a sprite stands on square [x, z], so a route cannot go there. */
  blocked(x: number, z: number): boolean;
}

/** A route: each square from the start to the end, both in it, and its length in feet. */
export interface Route {
  squares: Square[];
  feet: number;
}

/**
 * What a drag shows: a route to the target, "none" when no route goes to a
 * free target, or null when it shows nothing.
 */
export type DragRoute = Route | "none" | null;

/** True when a drag shows a route, not "none" and not null. */
export function isRoute(route: DragRoute): route is Route {
  return route !== null && route !== "none";
}

/** A straight step is 5 ft. A diagonal step is 5 ft, then 10 ft, then 5 ft, and so on. */
export const STEP_FEET = 5;

/**
 * The eight steps from a square, straight steps first. The order is fixed, so
 * the choice between two equal routes is always the same, and the line on the
 * board does not jump between them.
 */
const STEPS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

/**
 * The shortest route from `from` to `to` on `grid`, by the 3.5e rules, or
 * null when no route goes there. A step goes to one of the eight squares
 * around a square. A route goes around a blocked square, but a diagonal step
 * can go between two blocked squares. The start square can be blocked (the
 * moving sprite stands on it); a blocked end has no route. Of the shortest
 * routes, it gives one with the fewest steps.
 *
 * The cost of a diagonal step depends on the number of diagonal steps before
 * it, odd or even. So the search (Dijkstra) goes over each square two times:
 * after an even number of diagonal steps, and after an odd number.
 */
export function findPath(grid: Grid, from: Square, to: Square): Route | null {
  // The input can come from outside, so check that both are whole-number squares.
  if (!onBoard(grid, from) || !onBoard(grid, to)) return null;
  if (from.x === to.x && from.z === to.z) {
    return { squares: [{ x: from.x, z: from.z }], feet: 0 };
  }
  const { width, depth } = grid;
  // State s is square (x, z) with the odd/even count of diagonal steps:
  // s = (z * width + x) * 2 + odd.
  const count = width * depth * 2;
  const feet = new Float64Array(count).fill(Infinity);
  const steps = new Int32Array(count);
  const before = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  const queue = new Queue();

  const startState = (from.z * width + from.x) * 2;
  feet[startState] = 0;
  queue.push(0, 0, startState);
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const s = next;
    if (done[s]) continue;
    done[s] = 1;
    const odd = s & 1;
    const square = s >> 1;
    const x = square % width;
    const z = (square - x) / width;
    if (x === to.x && z === to.z)
      return { squares: trace(before, s, width), feet: feet[s] };
    for (const [dx, dz] of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
      if (grid.blocked(nx, nz)) continue;
      const diagonal = dx !== 0 && dz !== 0;
      const cost = diagonal && odd ? 2 * STEP_FEET : STEP_FEET;
      const t = (nz * width + nx) * 2 + (diagonal ? odd ^ 1 : odd);
      const f = feet[s] + cost;
      const n = steps[s] + 1;
      if (f < feet[t] || (f === feet[t] && n < steps[t])) {
        feet[t] = f;
        steps[t] = n;
        before[t] = s;
        queue.push(f, n, t);
      }
    }
  }
  return null;
}

/**
 * What a drag from `from` shows for the target `to`:
 *
 * - null when the target is off the board (null), the start square, or a
 *   square another sprite holds (the drop does not move the sprite there);
 * - the route to a free target;
 * - "none" when no route goes to a free target (the drop still moves the sprite).
 */
export function dragRoute(
  grid: Grid,
  from: Square,
  to: Square | null,
): DragRoute {
  if (!to || !onBoard(grid, to) || grid.blocked(to.x, to.z)) return null;
  if (to.x === from.x && to.z === from.z) return null;
  return findPath(grid, from, to) ?? "none";
}

/** The words of the label of a drag route: "30 ft", "No path", or null for no label. */
export function routeLabel(route: DragRoute): string | null {
  if (isRoute(route)) return `${route.feet} ft`;
  return route === "none" ? "No path" : null;
}

/** The squares from the start to state `end`, by the `before` of each state. */
function trace(before: Int32Array, end: number, width: number): Square[] {
  const squares: Square[] = [];
  for (let s = end; s !== -1; s = before[s]) {
    const square = s >> 1;
    const x = square % width;
    squares.push({ x, z: (square - x) / width });
  }
  return squares.reverse();
}

/**
 * A binary heap of states by feet, then by steps, then by the order they came
 * in, so the search is the same each time.
 */
class Queue {
  private readonly items: {
    feet: number;
    steps: number;
    order: number;
    state: number;
  }[] = [];
  private order = 0;

  push(feet: number, steps: number, state: number): void {
    const items = this.items;
    items.push({ feet, steps, order: this.order++, state });
    let i = items.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!this.less(i, up)) break;
      [items[i], items[up]] = [items[up], items[i]];
      i = up;
    }
  }

  /** The first state, or undefined when the queue is empty. */
  pop(): number | undefined {
    const items = this.items;
    const first = items[0];
    const last = items.pop();
    if (!first || !last) return undefined;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let least = i;
        if (left < items.length && this.less(left, least)) least = left;
        if (right < items.length && this.less(right, least)) least = right;
        if (least === i) break;
        [items[i], items[least]] = [items[least], items[i]];
        i = least;
      }
    }
    return first.state;
  }

  private less(a: number, b: number): boolean {
    const p = this.items[a];
    const q = this.items[b];
    if (p.feet !== q.feet) return p.feet < q.feet;
    if (p.steps !== q.steps) return p.steps < q.steps;
    return p.order < q.order;
  }
}
