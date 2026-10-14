import { readFileSync } from "node:fs";
import { Box3, Mesh, Ray, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Board } from "../shared/scene.js";
import { columnTop, createBoardMesh } from "./board.js";
import { BoardCamera, TURN_MS } from "./camera.js";
import { crossesTop, pickSquare, type Square } from "./picking.js";

// A high column (9) beside low ones, so the high column hides some of them.
const BOARD: Board = {
  width: 4,
  depth: 3,
  materials: { s: { name: "stone", top: "#8e8a82", side: "#66615a" } },
  heights: ["1200", "3900", "0010"],
  tiles: ["ssss", "ssss", "ssss"],
};
// A row of three: a column of height 2 (top 1.5) between two of height 0 (top 0.5).
const ROW: Board = {
  width: 3,
  depth: 1,
  materials: BOARD.materials,
  heights: ["020"],
  tiles: ["sss"],
};
const [W, H] = [800, 600];
// Points on a top, from its corner. In the isometric view, the ray through the
// center of a top passes exactly through grid corners, where two columns touch,
// so the points are off the center.
const POINTS = [
  [0.3, 0.6],
  [0.7, 0.4],
];

/** The square the ray first hits on the real board mesh, as three.js finds it. */
function meshPick(mesh: Mesh, ray: Ray): Square | null {
  const [hit] = new Raycaster(ray.origin, ray.direction).intersectObject(mesh);
  if (!hit?.face) return null;
  // A point just inside the face is in the column that owns the face.
  const inside = hit.point.clone().addScaledVector(hit.face.normal, -1e-4);
  return { x: Math.floor(inside.x), z: Math.floor(inside.z) };
}

describe("pickSquare", () => {
  it("finds the square under a point on a column top at each of the 4 turns", () => {
    const mesh = createBoardMesh(BOARD);
    const view = new BoardCamera(new Box3().setFromObject(mesh));
    view.resize(W, H);

    for (let turn = 0; turn < 4; turn++) {
      let hidden = 0;
      for (let z = 0; z < BOARD.depth; z++) {
        for (let x = 0; x < BOARD.width; x++) {
          const top = columnTop(Number(BOARD.heights[z][x]));
          for (const [px, pz] of POINTS) {
            const point = new Vector3(x + px, top, z + pz);
            const ndc = point.project(view.camera);
            const ray = view.ray(((ndc.x + 1) / 2) * W, ((1 - ndc.y) / 2) * H);
            const expected = meshPick(mesh, ray);
            expect(expected).not.toBeNull();
            expect(
              pickSquare(BOARD, ray),
              `turn ${turn}, [${x}, ${z}]`,
            ).toEqual(expected);
            if (expected?.x !== x || expected.z !== z) hidden++;
          }
        }
      }
      expect(hidden, `turn ${turn}`).toBeGreaterThan(0);
      view.rotate(1, turn * 1000);
      view.tick(turn * 1000 + TURN_MS);
    }
  });

  it("finds its own square at the exact center of every visible top of the demo board", () => {
    const board = (
      JSON.parse(
        readFileSync(
          new URL("../../public/scenes/demo.json", import.meta.url),
          {
            encoding: "utf8",
          },
        ),
      ) as { board: Board }
    ).board;
    const mesh = createBoardMesh(board);
    const view = new BoardCamera(new Box3().setFromObject(mesh));
    view.resize(W, H);

    for (let turn = 0; turn < 4; turn++) {
      let visible = 0;
      for (let z = 0; z < board.depth; z++) {
        for (let x = 0; x < board.width; x++) {
          const top = columnTop(Number(board.heights[z][x]));
          const ndc = new Vector3(x + 0.5, top, z + 0.5).project(view.camera);
          const ray = view.ray(((ndc.x + 1) / 2) * W, ((1 - ndc.y) / 2) * H);
          const [hit] = new Raycaster(
            ray.origin,
            ray.direction,
          ).intersectObject(mesh);
          // The top of this square is visible when the mesh's first hit is on it.
          if (
            !hit?.face ||
            hit.face.normal.y < 0.5 ||
            Math.floor(hit.point.x) !== x ||
            Math.floor(hit.point.z) !== z
          ) {
            continue;
          }
          visible++;
          expect(pickSquare(board, ray), `turn ${turn}, [${x}, ${z}]`).toEqual({
            x,
            z,
          });
        }
      }
      expect(visible, `turn ${turn}`).toBeGreaterThan(0);
      view.rotate(1, turn * 1000);
      view.tick(turn * 1000 + TURN_MS);
    }
  });

  it("gives null for a ray that misses the board", () => {
    const view = new BoardCamera(
      new Box3().setFromObject(createBoardMesh(BOARD)),
    );
    view.resize(W, H);
    expect(pickSquare(BOARD, view.ray(0, 0))).toBeNull();
    // A ray that goes down outside the board, and one that goes over it.
    const down = new Vector3(0, -1, 0);
    expect(pickSquare(BOARD, new Ray(new Vector3(-1, 10, 1), down))).toBeNull();
    const across = new Vector3(1, 0, 0);
    expect(
      pickSquare(BOARD, new Ray(new Vector3(-1, 6, 1), across)),
    ).toBeNull();
  });

  describe("with tops", () => {
    // Each ray goes to -x, and down 0.5 for each square.
    const left = new Vector3(-1, -0.5, 0);

    it("goes through the side of a taller column to the top behind it", () => {
      // At x = 2 the ray is at y = 1.2, on the side of [1, 0]. It leaves that
      // column at y = 0.7 and comes down on the top of [0, 0].
      const ray = new Ray(new Vector3(4, 2.2, 0.5), left);
      expect(pickSquare(ROW, ray)).toEqual({ x: 1, z: 0 });
      expect(pickSquare(ROW, ray, { tops: true })).toEqual({ x: 0, z: 0 });
    });

    it("gives the first top that the ray comes down on", () => {
      // At x = 2 the ray is at y = 1.8, over [1, 0]. It comes down on its top.
      const ray = new Ray(new Vector3(4, 2.8, 0.5), left);
      expect(pickSquare(ROW, ray, { tops: true })).toEqual({ x: 1, z: 0 });
    });

    it("gives null for a ray that hits only sides and leaves the board", () => {
      // Under the top of [2, 0], to the base.
      const down = new Ray(new Vector3(4, 0.8, 0.5), left);
      expect(pickSquare(ROW, down)).toEqual({ x: 2, z: 0 });
      expect(pickSquare(ROW, down, { tops: true })).toBeNull();
      // Through all three columns, under each top, out at x = 0.
      const across = new Ray(new Vector3(4, 0.4, 0.5), new Vector3(-1, 0, 0));
      expect(pickSquare(ROW, across)).toEqual({ x: 2, z: 0 });
      expect(pickSquare(ROW, across, { tops: true })).toBeNull();
    });
  });
});

describe("crossesTop", () => {
  it("is true where the ray comes down through the top plane inside the square, also behind a column", () => {
    // This ray comes down on the top of [1, 0] at x = 1.4. It reaches y = 0.5
    // at x = 0.6, in [0, 0], behind [1, 0].
    const ray = new Ray(new Vector3(4, 2.2, 0.5), new Vector3(-1, -0.5, 0));
    expect(crossesTop(ROW, ray, { x: 0, z: 0 })).toBe(true);
    expect(crossesTop(ROW, ray, { x: 2, z: 0 })).toBe(false);
  });

  it("is false for a ray that does not go down, or that starts under the top", () => {
    const flat = new Ray(new Vector3(4, 1, 0.5), new Vector3(-1, 0, 0));
    expect(crossesTop(ROW, flat, { x: 0, z: 0 })).toBe(false);
    const under = new Ray(new Vector3(0.5, 0.2, 0.5), new Vector3(0, -1, 0));
    expect(crossesTop(ROW, under, { x: 0, z: 0 })).toBe(false);
  });
});
