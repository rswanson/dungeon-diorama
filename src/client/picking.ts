import type { Ray } from "three";
import type { Board, Square } from "../shared/scene.js";
import { columnTop } from "./board.js";

/** The top of the highest column a board can have (height 9). */
const HIGHEST = columnTop(9);

/** Absorbs floating-point rounding at grid corners, where a ray can end a hair under a top it only touches. */
const TOUCH = 1e-12;

/**
 * The square of the first column that `ray` hits, on its top or on a side, or
 * null when the ray does not hit the board. With `tops`, only a top counts:
 * the ray goes through the sides of a column, and the square is the first
 * column whose top the ray comes down on, as a sprite can stand only on a top.
 * It walks the squares under the ray in order (a grid walk), so it does not
 * need the board's mesh.
 */
export function pickSquare(
  board: Board,
  ray: Ray,
  { tops = false }: { tops?: boolean } = {},
): Square | null {
  const o = ray.origin;
  const d = ray.direction;

  // The part of the ray in the board's box.
  let enter = 0;
  let exit = Infinity;
  const slabs: [number, number, number][] = [
    [o.x, d.x, board.width],
    [o.y, d.y, HIGHEST],
    [o.z, d.z, board.depth],
  ];
  for (const [start, step, size] of slabs) {
    if (step === 0) {
      if (start < 0 || start > size) return null;
      continue;
    }
    const a = -start / step;
    const b = (size - start) / step;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if (!(enter <= exit) || exit === Infinity) return null;

  let x = cellOf(o.x + d.x * enter, board.width);
  let z = cellOf(o.z + d.z * enter, board.depth);
  const stepX = Math.sign(d.x);
  const stepZ = Math.sign(d.z);
  // The ray distance to the next grid line on x and on z, and between two lines.
  let nextX = stepX === 0 ? Infinity : (x + (stepX > 0 ? 1 : 0) - o.x) / d.x;
  let nextZ = stepZ === 0 ? Infinity : (z + (stepZ > 0 ? 1 : 0) - o.z) / d.z;
  const gapX = Math.abs(1 / d.x);
  const gapZ = Math.abs(1 / d.z);

  let t = enter;
  for (;;) {
    const leave = Math.min(nextX, nextZ, exit);
    const top = columnTop(Number(board.heights[z][x]));
    const inY = o.y + d.y * t;
    const outY = o.y + d.y * leave;
    // In the box, the ray is between the base and the highest top. A ray that
    // only touches the top edge of a column (equal height) does not hit it. On
    // a top, the ray goes into the cell at or above the top and leaves it below.
    const hit = tops
      ? inY >= top - TOUCH && outY < top - TOUCH
      : Math.min(inY, outY) < top - TOUCH;
    if (hit) return { x, z };
    if (leave >= exit) return null;
    if (nextX === nextZ) {
      // A ray through a grid corner leaves both cells at once.
      x += stepX;
      z += stepZ;
      t = nextX;
      nextX += gapX;
      nextZ += gapZ;
    } else if (nextX < nextZ) {
      x += stepX;
      t = nextX;
      nextX += gapX;
    } else {
      z += stepZ;
      t = nextZ;
      nextZ += gapZ;
    }
    if (x < 0 || x >= board.width || z < 0 || z >= board.depth) return null;
  }
}

/** The cell that holds `p`, kept on the board at its far edge. */
function cellOf(p: number, size: number): number {
  return Math.min(Math.max(Math.floor(p), 0), size - 1);
}
