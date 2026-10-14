import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type Ray,
} from "three";
import type { Board, SpriteSpec } from "../shared/scene.js";
import { columnTop } from "./board.js";

// A sprite is pixel art made into a thin slab of voxels. It stands on the top
// of its square's column, and its front turns to the camera.

/** The widest and the highest sprite image, in pixels. */
export const MAX_WIDTH = 16;
export const MAX_HEIGHT = 32;
/** The size of one voxel, in board units: 16 pixels fill one square. */
export const VOXEL = 1 / 16;
/** Each pixel is this many voxels deep. */
export const DEPTH = 2;
/** A pixel with less alpha than this is empty. */
const OPAQUE = 128;
/** The color and the size of the block that stands in for a sprite whose image did not load. */
const FALLBACK_COLOR = "#ff00ff";
const FALLBACK_WIDTH = 16;
const FALLBACK_HEIGHT = 24;

/** One voxel of a sprite, in voxel steps. */
export interface Voxel {
  /** The pixel column, from the left of the image. */
  x: number;
  /** The pixel row, from the bottom of the image. */
  y: number;
  /** The depth layer, 0 at the back, `DEPTH - 1` at the front. */
  z: number;
  /** The sRGB color of the pixel, each part 0–255. */
  rgb: [number, number, number];
}

/** The voxels of a sprite and the width of its image. */
export interface SpriteVoxels {
  width: number;
  voxels: Voxel[];
}

export interface SpriteGeometryData {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

type Vec3 = [number, number, number];

/** True when an image of this size can be a sprite. */
export function fitsSprite(width: number, height: number): boolean {
  return (
    width >= 1 && height >= 1 && width <= MAX_WIDTH && height <= MAX_HEIGHT
  );
}

/**
 * The voxels of an image: `DEPTH` voxels for each opaque pixel. `rgba` holds
 * 4 bytes for each pixel, row by row from the top, as `ImageData` does.
 */
export function voxelsFromPixels(
  width: number,
  height: number,
  rgba: ArrayLike<number>,
): Voxel[] {
  const voxels: Voxel[] = [];
  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      const i = (row * width + x) * 4;
      if (rgba[i + 3] < OPAQUE) continue;
      const rgb: Voxel["rgb"] = [rgba[i], rgba[i + 1], rgba[i + 2]];
      for (let z = 0; z < DEPTH; z++) {
        voxels.push({ x, y: height - 1 - row, z, rgb });
      }
    }
  }
  return voxels;
}

/** The magenta block that stands in for a sprite whose image did not load. */
export function fallbackVoxels(): SpriteVoxels {
  const color = new Color(FALLBACK_COLOR);
  const rgb = [color.r, color.g, color.b].map((c) => Math.round(c * 255));
  const rgba: number[] = [];
  for (let i = 0; i < FALLBACK_WIDTH * FALLBACK_HEIGHT; i++) {
    rgba.push(rgb[0], rgb[1], rgb[2], 255);
  }
  return {
    width: FALLBACK_WIDTH,
    voxels: voxelsFromPixels(FALLBACK_WIDTH, FALLBACK_HEIGHT, rgba),
  };
}

/** The six faces of a voxel, by the direction of the neighbour voxel. */
const FACES: { dir: Vec3; corners: Vec3[] }[] = [
  // Each face lists its corners in the unit cube, counter-clockwise as seen from outside.
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

/**
 * One merged set of faces for a sprite, in board units. The slab is centered
 * on x = 0 and z = 0, its bottom is at y = 0, and its front faces +z. It leaves
 * out each face between two voxels.
 */
export function buildSpriteGeometry({
  width,
  voxels,
}: SpriteVoxels): SpriteGeometryData {
  const data: SpriteGeometryData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
  };
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const filled = new Set(voxels.map((v) => key(v.x, v.y, v.z)));
  const color = new Color();

  for (const v of voxels) {
    color.setRGB(
      v.rgb[0] / 255,
      v.rgb[1] / 255,
      v.rgb[2] / 255,
      SRGBColorSpace,
    );
    for (const { dir, corners } of FACES) {
      if (filled.has(key(v.x + dir[0], v.y + dir[1], v.z + dir[2]))) continue;
      const start = data.positions.length / 3;
      for (const [cx, cy, cz] of corners) {
        data.positions.push(
          (v.x + cx - width / 2) * VOXEL,
          (v.y + cy) * VOXEL,
          (v.z + cz - DEPTH / 2) * VOXEL,
        );
        data.normals.push(...dir);
        data.colors.push(color.r, color.g, color.b);
      }
      data.indices.push(
        start,
        start + 1,
        start + 2,
        start,
        start + 2,
        start + 3,
      );
    }
  }
  return data;
}

/** The height of a sprite, in board units: the top of its highest voxel. */
export function spriteHeight({ voxels }: SpriteVoxels): number {
  return voxels.reduce((top, v) => Math.max(top, v.y + 1), 0) * VOXEL;
}

/** One sprite on the board. */
export interface PlacedSprite {
  spec: SpriteSpec;
  mesh: Mesh;
  /** The height of the sprite above its column top, in board units. */
  height: number;
}

/** The top of a sprite's head, on its vertical axis. */
export function headOf(sprite: PlacedSprite, target: Vector3): Vector3 {
  const { position } = sprite.mesh;
  return target.copy(position).setY(position.y + sprite.height);
}

/** The lighting of the sprites is the same as the board's. */
const MATERIAL = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0,
});

/**
 * The sprites on the board. Each one is one mesh that casts and receives
 * shadows, and turns about its own vertical axis to face the camera.
 */
export class SpriteLayer {
  readonly group = new Group();
  private readonly sprites = new Map<string, PlacedSprite>();
  private readonly raycaster = new Raycaster();
  private yaw = 0;

  /** `occluders` hide a sprite behind them from `spriteAt`, for example the board. */
  constructor(
    private readonly board: Board,
    private readonly occluders: Object3D[] = [],
  ) {
    this.group.name = "sprites";
  }

  /** Puts a sprite on its square. It replaces a sprite with the same id. */
  add(spec: SpriteSpec, voxels: SpriteVoxels): PlacedSprite {
    this.remove(spec.id);
    const data = buildSpriteGeometry(voxels);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(data.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(data.normals, 3),
    );
    geometry.setAttribute("color", new Float32BufferAttribute(data.colors, 3));
    geometry.setIndex(data.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, MATERIAL);
    mesh.name = `sprite:${spec.id}`;
    mesh.userData.spriteId = spec.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const [x, z] = spec.at;
    mesh.position.set(
      x + 0.5,
      columnTop(Number(this.board.heights[z][x])),
      z + 0.5,
    );
    mesh.rotation.y = this.yaw;
    mesh.updateMatrixWorld();
    this.group.add(mesh);

    const sprite = { spec, mesh, height: spriteHeight(voxels) };
    this.sprites.set(spec.id, sprite);
    return sprite;
  }

  get(id: string): PlacedSprite | undefined {
    return this.sprites.get(id);
  }

  /**
   * Turns every sprite to face a camera at this azimuth (the camera angle
   * around the board). It returns true when a sprite turned.
   */
  face(azimuth: number): boolean {
    if (azimuth === this.yaw) return false;
    this.yaw = azimuth;
    for (const { mesh } of this.sprites.values()) {
      mesh.rotation.y = azimuth;
      mesh.updateMatrixWorld();
    }
    return this.sprites.size > 0;
  }

  /** The id of the first sprite that `ray` hits, or null when it hits none or hits an occluder first. */
  spriteAt(ray: Ray): string | null {
    this.raycaster.ray.copy(ray);
    const meshes = [...this.sprites.values()].map((s) => s.mesh);
    const [hit] = this.raycaster.intersectObjects(
      [...meshes, ...this.occluders],
      false,
    );
    const id: unknown = hit?.object.userData.spriteId;
    return typeof id === "string" ? id : null;
  }

  private remove(id: string): void {
    const old = this.sprites.get(id);
    if (!old) return;
    this.group.remove(old.mesh);
    old.mesh.geometry.dispose();
    this.sprites.delete(id);
  }
}
