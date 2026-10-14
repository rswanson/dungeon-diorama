import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
} from "three";
import type { Board } from "../shared/scene.js";

// Board units: one square is one unit wide. Square [x, z] covers x to x + 1
// and z to z + 1. The base of the board is at y = 0.

/** The height of one voxel layer, in board units. */
const LAYER_HEIGHT = 0.5;
/** The width of the grid line on each edge of a square's top face. */
export const GRID_LINE = 0.025;
/** How much darker the grid line is than the top color. */
const GRID_SHADE = 0.6;

export interface BoardGeometryData {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

type Vec3 = [number, number, number];

/** The four sides of a square, by the direction of the neighbour square. */
const SIDES = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
] as const;

/** The y of a column's top face: the base layer plus `height` layers. */
export function columnTop(height: number): number {
  return (height + 1) * LAYER_HEIGHT;
}

/** The height (0–9) of square [x, z], or undefined off the board. */
function heightAt(board: Board, x: number, z: number): number | undefined {
  if (x < 0 || x >= board.width || z < 0 || z >= board.depth) return undefined;
  return Number(board.heights[z][x]);
}

/**
 * Builds one merged set of faces for all the columns of a valid board.
 * It leaves out the faces that cannot be seen: the bottoms, and each part of a
 * side face that is at or below the top of the neighbour column.
 */
export function buildBoardGeometry(board: Board): BoardGeometryData {
  const data: BoardGeometryData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
  };
  const colors = new Map<string, { top: Color; side: Color; line: Color }>();
  for (const [key, material] of Object.entries(board.materials)) {
    // Color converts the sRGB hex to the renderer's linear working space.
    const top = new Color(material.top);
    colors.set(key, {
      top,
      side: new Color(material.side),
      line: top.clone().multiplyScalar(GRID_SHADE),
    });
  }

  for (let z = 0; z < board.depth; z++) {
    for (let x = 0; x < board.width; x++) {
      const key = board.tiles[z][x];
      const color = colors.get(key);
      if (!color) throw new Error(`Unknown material key "${key}".`);
      const y = columnTop(Number(board.heights[z][x]));

      addTop(data, x, z, y, color.top, color.line);
      for (const side of SIDES) {
        const neighbour = heightAt(board, x + side.dx, z + side.dz);
        // A board-edge side goes down to the base of the board.
        const low = neighbour === undefined ? 0 : columnTop(neighbour);
        if (low < y) addSide(data, x, z, side, low, y, color.side);
      }
    }
  }
  return data;
}

/** One mesh for the whole board, which casts and receives shadows. */
export function createBoardMesh(board: Board): Mesh {
  const data = buildBoardGeometry(board);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(data.colors, 3));
  geometry.setIndex(data.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "board";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The top face of a square: the top color, with a grid line on each edge. */
function addTop(
  data: BoardGeometryData,
  x: number,
  z: number,
  y: number,
  top: Color,
  line: Color,
): void {
  const up: Vec3 = [0, 1, 0];
  const [x0, x1, z0, z1] = [x, x + 1, z, z + 1];
  const w = GRID_LINE;
  const flat = (ax: number, bx: number, az: number, bz: number): Vec3[] => [
    [ax, y, az],
    [ax, y, bz],
    [bx, y, bz],
    [bx, y, az],
  ];
  addQuad(data, flat(x0 + w, x1 - w, z0 + w, z1 - w), up, top);
  addQuad(data, flat(x0, x1, z0, z0 + w), up, line);
  addQuad(data, flat(x0, x1, z1 - w, z1), up, line);
  addQuad(data, flat(x0, x0 + w, z0 + w, z1 - w), up, line);
  addQuad(data, flat(x1 - w, x1, z0 + w, z1 - w), up, line);
}

/**
 * Adds the side of square [x, z] on the `side` of it, from `low` up to `high`.
 * The corners go counter-clockwise as seen from outside, the way the normal
 * points: bottom left, bottom right, top right, top left.
 */
function addSide(
  data: BoardGeometryData,
  x: number,
  z: number,
  { dx, dz }: (typeof SIDES)[number],
  low: number,
  high: number,
  color: Color,
): void {
  // The middle of the edge, and half of the way along it to the right.
  const [mx, mz] = [x + 0.5 + dx / 2, z + 0.5 + dz / 2];
  const [rx, rz] = [dz / 2, -dx / 2];
  const [lx, lz] = [mx - rx, mz - rz];
  const [px, pz] = [mx + rx, mz + rz];
  addQuad(
    data,
    [
      [lx, low, lz],
      [px, low, pz],
      [px, high, pz],
      [lx, high, lz],
    ],
    [dx, 0, dz],
    color,
  );
}

/**
 * Adds a flat quad. Its corners must go counter-clockwise as seen from outside,
 * along `normal`, so that the front side faces `normal`.
 */
function addQuad(
  data: BoardGeometryData,
  corners: Vec3[],
  normal: Vec3,
  color: Color,
): void {
  const start = data.positions.length / 3;
  for (const corner of corners) {
    data.positions.push(...corner);
    data.normals.push(...normal);
    data.colors.push(color.r, color.g, color.b);
  }
  data.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}
