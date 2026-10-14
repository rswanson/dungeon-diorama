import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { Box3, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { renderSprites } from "../../scripts/sprites.mjs";
import { parseScene, type Board, type SpriteSpec } from "../shared/scene.js";
import { columnTop, createBoardMesh } from "./board.js";
import { BoardCamera, TURN_MS } from "./camera.js";
import {
  buildSpriteGeometry,
  fitsSprite,
  SpriteLayer,
  VOXEL,
  voxelsFromPixels,
} from "./sprites.js";

const PUBLIC = new URL("../../public/", import.meta.url);
const STARTERS = ["fighter", "wizard", "rogue", "cleric", "goblin", "orc"];

/** RGBA bytes for rows of "#" (opaque red) and "." (transparent). */
function image(rows: string[]): number[] {
  return rows.flatMap((row) =>
    [...row].flatMap((ch) => (ch === "#" ? [255, 0, 0, 255] : [0, 0, 0, 0])),
  );
}

const BOARD: Board = {
  width: 2,
  depth: 1,
  materials: { s: { name: "stone", top: "#888888", side: "#666666" } },
  heights: ["03"],
  tiles: ["ss"],
};

const SPEC: SpriteSpec = {
  id: "imp",
  name: "Imp",
  image: "sprites/imp.png",
  at: [1, 0],
};

describe("voxelsFromPixels", () => {
  it("makes two voxels for each opaque pixel", () => {
    const voxels = voxelsFromPixels(2, 2, image(["##", ".#"]));
    expect(voxels).toHaveLength(6);
  });

  it("counts rows from the bottom of the image", () => {
    const voxels = voxelsFromPixels(1, 3, image(["#", ".", "."]));
    expect(voxels.map((v) => v.y)).toEqual([2, 2]);
  });

  it("keeps the alpha limit at half", () => {
    const voxels = voxelsFromPixels(2, 1, [9, 9, 9, 127, 9, 9, 9, 128]);
    expect(voxels.map((v) => v.x)).toEqual([1, 1]);
  });
});

describe("buildSpriteGeometry", () => {
  it("leaves out the faces between the two depth layers", () => {
    const data = buildSpriteGeometry({
      width: 1,
      voxels: voxelsFromPixels(1, 1, image(["#"])),
    });
    // Two voxels of 6 faces less the 2 faces they share, 4 vertices each.
    expect(data.positions.length / 3).toBe(10 * 4);
    for (let i = 0; i < data.positions.length; i += 3) {
      // No face lies in the plane z = 0, between the layers.
      if (data.normals[i + 2] !== 0) {
        expect(Math.abs(data.positions[i + 2])).toBeCloseTo(VOXEL);
      }
    }
  });

  it("leaves out the faces between two neighbour pixels", () => {
    const one = buildSpriteGeometry({
      width: 1,
      voxels: voxelsFromPixels(1, 1, image(["#"])),
    });
    const two = buildSpriteGeometry({
      width: 2,
      voxels: voxelsFromPixels(2, 1, image(["##"])),
    });
    // Two pixels side by side share one face on each layer.
    expect(two.positions.length).toBe(2 * one.positions.length - 2 * 2 * 4 * 3);
  });
});

describe("SpriteLayer", () => {
  it("stands the bottom row on the column top, centered on the square", () => {
    const layer = new SpriteLayer(BOARD);
    const voxels = voxelsFromPixels(4, 2, image(["....", ".##."]));
    const { mesh } = layer.add(SPEC, { width: 4, voxels });
    const box = new Box3().setFromObject(mesh);
    expect(box.min.y).toBeCloseTo(columnTop(3));
    expect(box.max.y).toBeCloseTo(columnTop(3) + VOXEL);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(1.5);
    expect(box.getCenter(new Vector3()).z).toBeCloseTo(0.5);
  });

  it("faces the camera after each quarter turn", () => {
    const layer = new SpriteLayer(BOARD);
    const { mesh } = layer.add(SPEC, {
      width: 1,
      voxels: voxelsFromPixels(1, 1, image(["#"])),
    });
    const view = new BoardCamera(new Box3(new Vector3(), new Vector3(2, 2, 1)));
    let now = 0;
    for (const dir of [1, 1, 1, 1, -1] as const) {
      view.rotate(dir, now);
      now += TURN_MS;
      view.tick(now);
      expect(layer.face(view.azimuth)).toBe(true);
      // The front of the slab (+z) points to the camera on the ground.
      const front = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
      const toCamera = view.camera.position
        .clone()
        .sub(view.target)
        .setY(0)
        .normalize();
      expect(front.dot(toCamera)).toBeCloseTo(1);
    }
    expect(layer.face(view.azimuth)).toBe(false);
  });
});

describe("SpriteLayer.spriteAt", () => {
  /** Two squares deep: the sprite stands on [0, 0], and [0, 1] is in front of it (+z). */
  function stage(front: string): { layer: SpriteLayer } {
    const board: Board = {
      width: 2,
      depth: 2,
      materials: BOARD.materials,
      heights: ["00", front],
      tiles: ["ss", "ss"],
    };
    const layer = new SpriteLayer(board, [createBoardMesh(board)]);
    // A square sprite of 4 px: 0.25 high, 0.25 wide, on the top of [0, 0] at y = 0.5.
    layer.add(
      { ...SPEC, at: [0, 0] },
      {
        width: 4,
        voxels: voxelsFromPixels(4, 4, image(Array(4).fill("####"))),
      },
    );
    return { layer };
  }
  /** A ray at height y that goes from +z towards -z along x. */
  const along = (x: number, y: number): Ray =>
    new Ray(new Vector3(x, y, 5), new Vector3(0, 0, -1));

  it("returns the id of the sprite that the ray hits", () => {
    const { layer } = stage("00");
    expect(layer.spriteAt(along(0.5, 0.6))).toBe("imp");
  });

  it("returns null when a board column in front hides the sprite", () => {
    const { layer } = stage("30");
    expect(layer.spriteAt(along(0.5, 0.6))).toBeNull();
  });

  it("returns null when the ray misses", () => {
    const { layer } = stage("00");
    expect(layer.spriteAt(along(1.5, 0.6))).toBeNull();
  });
});

describe("fitsSprite", () => {
  it("takes images up to 16 px wide and 32 px high", () => {
    expect(fitsSprite(16, 32)).toBe(true);
    expect(fitsSprite(17, 24)).toBe(false);
    expect(fitsSprite(16, 33)).toBe(false);
  });
});

describe("the starter sprites", () => {
  it("are 16x24 RGBA PNGs that stand on their bottom row", () => {
    for (const name of STARTERS) {
      const png = readFileSync(new URL(`sprites/${name}.png`, PUBLIC));
      // The IHDR chunk follows the 8-byte signature and its length and type.
      expect(png.readUInt32BE(16), name).toBe(16);
      expect(png.readUInt32BE(20), name).toBe(24);
      expect([png[24], png[25]], name).toEqual([8, 6]);
      // One IDAT chunk; each row is a filter byte and 16 RGBA pixels.
      const length = png.readUInt32BE(33);
      expect(png.toString("ascii", 37, 41)).toBe("IDAT");
      const raw = inflateSync(png.subarray(41, 41 + length));
      expect(raw.length, name).toBe(24 * (1 + 16 * 4));
      const bottom = raw.subarray(23 * 65 + 1, 24 * 65);
      expect(bottom.some((_, i) => i % 4 === 3 && bottom[i] >= 128)).toBe(true);
    }
  });

  it("are the PNGs that scripts/sprites.mjs makes", () => {
    const made = renderSprites();
    expect(Object.keys(made).sort()).toEqual([...STARTERS].sort());
    for (const [name, png] of Object.entries(made)) {
      const file = readFileSync(new URL(`sprites/${name}.png`, PUBLIC));
      expect(png.equals(file), `${name}.png: run npm run sprites`).toBe(true);
    }
  });

  it("all stand in the demo scene, on images that exist", () => {
    const result = parseScene(
      readFileSync(new URL("scenes/demo.json", PUBLIC), "utf8"),
    );
    if (!result.ok) throw new Error(result.problems.join("\n"));
    const sprites = result.scene.sprites;
    expect(sprites.map((s) => s.id).sort()).toEqual([...STARTERS].sort());
    for (const sprite of sprites) {
      expect(existsSync(new URL(sprite.image, PUBLIC)), sprite.image).toBe(
        true,
      );
    }
  });
});
