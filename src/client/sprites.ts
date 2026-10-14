import {
  Color,
  Group,
  Mesh,
  Raycaster,
  SRGBColorSpace,
  type Object3D,
  type Ray,
  type Vector3,
} from "three";
import type { Board, SpriteSpec, Square } from "../shared/scene.js";
import {
  addQuad,
  geometryFrom,
  standPoint,
  VOXEL_MATERIAL,
  type GeometryData,
  type Vec3,
} from "./board.js";

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
const FALLBACK_RGB: Voxel["rgb"] = [255, 0, 255];
const FALLBACK_WIDTH = 16;
const FALLBACK_HEIGHT = 24;

/** One voxel of a sprite, in voxel steps. */
interface Voxel {
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
  const voxels: Voxel[] = [];
  for (let y = 0; y < FALLBACK_HEIGHT; y++) {
    for (let x = 0; x < FALLBACK_WIDTH; x++) {
      for (let z = 0; z < DEPTH; z++) {
        voxels.push({ x, y, z, rgb: FALLBACK_RGB });
      }
    }
  }
  return { width: FALLBACK_WIDTH, voxels };
}

/**
 * The six faces of a voxel: the face on the + side and the face on the - side
 * of each axis. Each lists its corners in the unit cube, counter-clockwise as
 * seen from outside: (u, v) in the order (0, 0), (1, 0), (1, 1), (0, 1) on the
 * + side, where u and v are the next two axes, and the reverse on the - side.
 */
const FACES = [0, 1, 2].flatMap((axis) =>
  ([1, -1] as const).map((sign) => {
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const dir: Vec3 = [0, 0, 0];
    dir[axis] = sign;
    const corners = (
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const
    ).map(([cu, cv]) => {
      const corner: Vec3 = [0, 0, 0];
      corner[axis] = sign > 0 ? 1 : 0;
      corner[u] = cu;
      corner[v] = cv;
      return corner;
    });
    return { dir, corners: sign > 0 ? corners : corners.reverse() };
  }),
);

/**
 * One merged set of faces for a sprite, in board units. The slab is centered
 * on x = 0 and z = 0, its bottom is at y = 0, and its front faces +z. It leaves
 * out each face between two voxels.
 */
export function buildSpriteGeometry({
  width,
  voxels,
}: SpriteVoxels): GeometryData {
  const data: GeometryData = {
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
      addQuad(
        data,
        corners.map(([cx, cy, cz]) => [
          (v.x + cx - width / 2) * VOXEL,
          (v.y + cy) * VOXEL,
          (v.z + cz - DEPTH / 2) * VOXEL,
        ]),
        dir,
        color,
      );
    }
  }
  return data;
}

/** The height of a sprite, in board units: the top of its highest voxel. */
function spriteHeight({ voxels }: SpriteVoxels): number {
  return voxels.reduce((top, v) => Math.max(top, v.y + 1), 0) * VOXEL;
}

/** One sprite on the board. */
interface PlacedSprite {
  spec: SpriteSpec;
  mesh: Mesh;
  /** The height of the sprite above its column top, in board units. */
  height: number;
}

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

  /**
   * Puts a sprite on a square: `at`, or the square of the scene file. It
   * replaces a sprite with the same id.
   */
  add(
    spec: SpriteSpec,
    voxels: SpriteVoxels,
    at: Square = { x: spec.at[0], z: spec.at[1] },
  ): PlacedSprite {
    this.remove(spec.id);
    const geometry = geometryFrom(buildSpriteGeometry(voxels));
    const mesh = new Mesh(geometry, VOXEL_MATERIAL);
    mesh.name = `sprite:${spec.id}`;
    mesh.userData.spriteId = spec.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    standPoint(this.board, at, mesh.position);
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
   * around the board).
   */
  face(azimuth: number): void {
    if (azimuth === this.yaw) return;
    this.yaw = azimuth;
    for (const { mesh } of this.sprites.values()) {
      mesh.rotation.y = azimuth;
      mesh.updateMatrixWorld();
    }
  }

  /**
   * The first sprite that `ray` hits: its id and the point of the hit, in
   * board units. It is null when the ray hits no sprite or hits an occluder
   * first.
   */
  spriteAt(ray: Ray): { id: string; point: Vector3 } | null {
    this.raycaster.ray.copy(ray);
    const meshes = [...this.sprites.values()].map((s) => s.mesh);
    const [hit] = this.raycaster.intersectObjects(
      [...meshes, ...this.occluders],
      false,
    );
    const id: unknown = hit?.object.userData.spriteId;
    return typeof id === "string" ? { id, point: hit.point } : null;
  }

  private remove(id: string): void {
    const old = this.sprites.get(id);
    if (!old) return;
    this.group.remove(old.mesh);
    old.mesh.geometry.dispose();
    this.sprites.delete(id);
  }
}
