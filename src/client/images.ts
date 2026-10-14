import type { SpriteSpec } from "../shared/scene.js";
import {
  fallbackVoxels,
  fitsSprite,
  MAX_HEIGHT,
  MAX_WIDTH,
  voxelsFromPixels,
  type SpriteVoxels,
} from "./sprites.js";

/**
 * Loads the voxels of a sprite's image. When the image does not load, or is
 * too large, it logs the image path and gives the magenta block.
 */
export async function loadSpriteVoxels(
  spec: SpriteSpec,
): Promise<SpriteVoxels> {
  try {
    return await readImage(spec.image);
  } catch (error) {
    console.error(
      `The sprite "${spec.id}" shows as a magenta block. Its image "${spec.image}" did not load or is too large.`,
      error,
    );
    return fallbackVoxels();
  }
}

async function readImage(path: string): Promise<SpriteVoxels> {
  const image = new Image();
  // The scene gives the path from the site root, as for the scene files.
  image.src = `/${path.replace(/^\/+/, "")}`;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!fitsSprite(width, height)) {
    throw new Error(
      `The image is ${width}x${height} px. A sprite is at most ${MAX_WIDTH} px wide and ${MAX_HEIGHT} px high.`,
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser has no 2D canvas.");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, voxels: voxelsFromPixels(width, height, data) };
}
