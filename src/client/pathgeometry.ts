// The geometry of the route line of a drag. It has no DOM, so the tests can use it.
import { Color, type BufferGeometry, type Vector3 } from "three";
import type { Board, Square } from "../shared/scene.js";
import {
  addQuad,
  geometryFrom,
  standPoint,
  type GeometryData,
  type Vec3,
} from "./board.js";

/** The width of the line, in board units. */
const WIDTH = 0.1;
/**
 * A riser stands this far from the side of the higher column, over the lower
 * square, so it does not touch the column.
 */
const EDGE_GAP = 0.02;
/** The line is this far above the column tops, above the glow of the target square. */
const RAISE = 0.03;
/** The radius of the dot on each square of the route, in board units. */
const DOT_RADIUS = 0.15;
/** An even number: each quad of a dot holds two of its segments. */
const DOT_SEGMENTS = 16;
/** The material gives the color of the line, so the vertex color is not used. */
const NO_COLOR = new Color();
const UP: Vec3 = [0, 1, 0];
/** The four directions that the faces of a riser look in. */
const FACES = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/**
 * The route line through `squares`, in board units: a dot on the top of each
 * square, and a flat strip between two squares. Where the next top is higher
 * or lower, the line goes straight up or down as a riser near the edge (or the
 * corner) between the two squares.
 */
export function pathGeometry(
  board: Board,
  squares: readonly Square[],
): BufferGeometry {
  const data: GeometryData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
  };
  const tops = squares.map((square) => {
    const top = standPoint(board, square);
    top.y += RAISE;
    return top;
  });
  for (const top of tops) dot(data, top);
  for (let i = 1; i < tops.length; i++) segment(data, tops[i - 1], tops[i]);
  return geometryFrom(data);
}

/** A flat dot on `c`. */
function dot(data: GeometryData, c: Vector3): void {
  const rim = (i: number): Vec3 => {
    const angle = (i / DOT_SEGMENTS) * Math.PI * 2;
    return [
      c.x + Math.cos(angle) * DOT_RADIUS,
      c.y,
      c.z + Math.sin(angle) * DOT_RADIUS,
    ];
  };
  for (let i = 0; i < DOT_SEGMENTS; i += 2) {
    addQuad(
      data,
      [[c.x, c.y, c.z], rim(i), rim(i + 1), rim(i + 2)],
      UP,
      NO_COLOR,
    );
  }
}

/**
 * The line from the top `p` to the top `q`. At different heights, it has a
 * riser: a thin box, as wide as the line on each axis, with no rotation. On
 * each axis that the step crosses, the side of the box nearest the higher
 * column is `EDGE_GAP` from the edge, over the lower square. The faces look
 * in four directions, so from no view are all of them edge-on.
 */
function segment(data: GeometryData, p: Vector3, q: Vector3): void {
  // Half the width of the line, flat and at a right angle to the way from p to q.
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const scale = WIDTH / 2 / Math.hypot(dx, dz);
  const side: [number, number] = [-dz * scale, dx * scale];
  if (p.y === q.y) {
    strip(data, p, q, side);
    return;
  }
  const [lower, higher] = p.y < q.y ? [p, q] : [q, p];
  const offset = EDGE_GAP + WIDTH / 2;
  // The centre of the riser is on the line from p to q, so the strips meet it.
  const cx = (p.x + q.x) / 2 + Math.sign(lower.x - higher.x) * offset;
  const cz = (p.z + q.z) / 2 + Math.sign(lower.z - higher.z) * offset;
  strip(data, p, { x: cx, y: p.y, z: cz }, side);
  riser(data, cx, cz, lower.y, higher.y);
  strip(data, { x: cx, y: q.y, z: cz }, q, side);
}

/** A flat strip of the line from p to q, both at the same height. */
function strip(
  data: GeometryData,
  p: { x: number; y: number; z: number },
  q: { x: number; y: number; z: number },
  [sx, sz]: [number, number],
): void {
  addQuad(
    data,
    [
      [p.x + sx, p.y, p.z + sz],
      [q.x + sx, q.y, q.z + sz],
      [q.x - sx, q.y, q.z - sz],
      [p.x - sx, p.y, p.z - sz],
    ],
    UP,
    NO_COLOR,
  );
}

/** The four vertical faces of a riser box on (cx, cz), from `low` up to `high`. */
function riser(
  data: GeometryData,
  cx: number,
  cz: number,
  low: number,
  high: number,
): void {
  const half = WIDTH / 2;
  for (const [nx, nz] of FACES) {
    // The middle of the face, and half of the face to its right, as seen from outside.
    const [mx, mz] = [cx + nx * half, cz + nz * half];
    const [rx, rz] = [nz * half, -nx * half];
    addQuad(
      data,
      [
        [mx - rx, low, mz - rz],
        [mx + rx, low, mz + rz],
        [mx + rx, high, mz + rz],
        [mx - rx, high, mz - rz],
      ],
      [nx, 0, nz],
      NO_COLOR,
    );
  }
}
