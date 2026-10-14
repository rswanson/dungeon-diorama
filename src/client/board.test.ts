import { Color } from "three";
import { describe, expect, it } from "vitest";
import type { Board } from "../shared/scene.js";
import {
  buildBoardGeometry,
  GRID_LINE,
  type BoardGeometryData,
} from "./board.js";

const MATERIALS = {
  s: { name: "stone", top: "#ff0000", side: "#0000ff" },
};

function board(heights: string[]): Board {
  return {
    width: heights[0].length,
    depth: heights.length,
    materials: MATERIALS,
    heights,
    tiles: heights.map((row) => "s".repeat(row.length)),
  };
}

interface Vertex {
  position: number[];
  normal: number[];
  color: number[];
}

function vertices(data: BoardGeometryData): Vertex[] {
  return Array.from({ length: data.positions.length / 3 }, (_, i) => ({
    position: data.positions.slice(i * 3, i * 3 + 3),
    normal: data.normals.slice(i * 3, i * 3 + 3),
    color: data.colors.slice(i * 3, i * 3 + 3),
  }));
}

/** The vertices of the side faces in the plane x = 1, which turn to +x or -x. */
function innerSide(data: BoardGeometryData): Vertex[] {
  return vertices(data).filter(
    (v) => Math.abs(v.normal[0]) === 1 && v.position[0] === 1,
  );
}

describe("buildBoardGeometry", () => {
  it("has no faces between two columns of equal height", () => {
    const data = buildBoardGeometry(board(["33"]));
    expect(innerSide(data)).toEqual([]);
    // Along z too: a 1x2 board of equal heights has no faces in the plane z = 1.
    const alongZ = vertices(buildBoardGeometry(board(["3", "3"])));
    expect(
      alongZ.filter((v) => Math.abs(v.normal[2]) === 1 && v.position[2] === 1),
    ).toEqual([]);
    // The board-edge sides go down to the base.
    const edge = vertices(data).filter((v) => v.normal[0] === -1);
    expect(edge.map((v) => v.position[1]).sort()).toEqual([0, 0, 2, 2]);
    // No bottoms.
    expect(vertices(data).some((v) => v.normal[1] === -1)).toBe(false);
  });

  it("draws only the part of a side above the neighbour's top", () => {
    // Height 0 has its top at 0.5 (the base layer); height 3 at 2.
    const side = innerSide(buildBoardGeometry(board(["03"])));
    expect(side.every((v) => v.normal[0] === -1)).toBe(true);
    expect(side.map((v) => v.position[1]).sort()).toEqual([0.5, 0.5, 2, 2]);
  });

  it("colors the top and the sides from the material, with a grid line on the top", () => {
    const data = buildBoardGeometry(board(["2"]));
    const top = new Color(MATERIALS.s.top).toArray();
    const side = new Color(MATERIALS.s.side).toArray();

    for (const v of vertices(data).filter((v) => v.normal[1] === 0)) {
      expect(v.color).toEqual(side);
    }
    const tops = vertices(data).filter((v) => v.normal[1] === 1);
    const isTop = (v: Vertex) => v.color.every((c, i) => c === top[i]);
    const inside = (n: number) => n >= GRID_LINE && n <= 1 - GRID_LINE;

    const centre = tops.filter(isTop);
    expect(centre).toHaveLength(4);
    for (const v of centre) {
      expect(inside(v.position[0]) && inside(v.position[2])).toBe(true);
    }

    // The grid line is a darker top color along each edge of the square.
    const line = tops.filter((v) => !isTop(v));
    for (const v of line) {
      expect(v.color.every((c, i) => c <= top[i])).toBe(true);
      expect(v.color.some((c, i) => c < top[i])).toBe(true);
    }
    for (const [axis, edge] of [
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1],
    ]) {
      expect(line.some((v) => v.position[axis] === edge)).toBe(true);
    }
  });

  it("winds every triangle so that its front side faces its normal", () => {
    const data = buildBoardGeometry(board(["0319", "9302", "5550"]));
    const point = (i: number) => data.positions.slice(i * 3, i * 3 + 3);
    expect(data.indices.length).toBeGreaterThan(0);
    for (let t = 0; t < data.indices.length; t += 3) {
      const [a, b, c] = [t, t + 1, t + 2].map((k) => point(data.indices[k]));
      const ab = b.map((n, i) => n - a[i]);
      const ac = c.map((n, i) => n - a[i]);
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const n = data.normals.slice(
        data.indices[t] * 3,
        data.indices[t] * 3 + 3,
      );
      expect(
        cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2],
      ).toBeGreaterThan(0);
    }
  });
});
