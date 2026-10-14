import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { Box3, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { spritePixels, type SpritePixels } from "../../scripts/sprites.js";
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
const PIXELS = spritePixels();
const STARTERS = Object.keys(PIXELS);

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

  it("winds every triangle so that its front side faces its normal", () => {
    const data = buildSpriteGeometry({
      width: 2,
      voxels: voxelsFromPixels(2, 1, image(["##"])),
    });
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
      layer.face(view.azimuth);
      // The front of the slab (+z) points to the camera on the ground.
      const front = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
      const toCamera = view.camera.position
        .clone()
        .sub(view.target)
        .setY(0)
        .normalize();
      expect(front.dot(toCamera)).toBeCloseTo(1);
    }
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

/** The pixels of an 8-bit RGBA PNG whose rows have no filter, as the generator writes it. */
function decodePng(png: Buffer): SpritePixels {
  let size = { width: 0, height: 0 };
  const data: Buffer[] = [];
  // After the 8-byte signature, each chunk is a length, a type, data and a CRC.
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      size = { width: body.readUInt32BE(0), height: body.readUInt32BE(4) };
      expect([body[8], body[9]], "bit depth and color type").toEqual([8, 6]);
    }
    if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const { width, height } = size;
  const raw = inflateSync(Buffer.concat(data));
  const stride = 1 + width * 4;
  expect(raw.length).toBe(height * stride);
  const rows = Array.from({ length: height }, (_, y) => {
    expect(raw[y * stride], `filter of row ${y}`).toBe(0);
    return raw.subarray(y * stride + 1, (y + 1) * stride);
  });
  return { width, height, rgba: Buffer.concat(rows) };
}

describe("the starter sprites", () => {
  it("are the 16x24 PNGs that scripts/sprites.ts makes, standing on their bottom row", () => {
    for (const [name, made] of Object.entries(PIXELS)) {
      const file = readFileSync(new URL(`sprites/${name}.png`, PUBLIC));
      const { width, height, rgba } = decodePng(file);
      expect([width, height], name).toEqual([16, 24]);
      expect(rgba.equals(made.rgba), `${name}.png: run npm run sprites`).toBe(
        true,
      );
      const bottom = rgba.subarray((height - 1) * width * 4);
      expect(
        bottom.some((_, i) => i % 4 === 3 && bottom[i] >= 128),
        name,
      ).toBe(true);
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
