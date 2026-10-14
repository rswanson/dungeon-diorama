import { Vector3 } from "three";
import type { Board } from "../shared/scene.js";
import type { BoardState } from "./board-state.js";
import type { BoardCamera } from "./camera.js";
import { standPoint, type SpriteLayer } from "./sprites.js";

/**
 * A small read-only view of the board on `window.diorama`. It exists for tests
 * (the Playwright drag test) and for agents that drive a browser. It changes
 * nothing. Each point is in CSS pixels from the top left of the canvas.
 */
export interface Diorama {
  /** True when each sprite of the scene stands on the board. */
  readonly ready: boolean;
  /** The point on the screen of the center of the top of square [x, z]. */
  squareScreen(x: number, z: number): { x: number; y: number };
  /** The point on the screen of the middle of a sprite's body, or null for an unknown sprite. */
  spriteScreen(id: string): { x: number; y: number } | null;
  /** The square `[x, z]` where a sprite stands at rest, or null while it is lifted, moves or did not load. */
  spriteSquare(id: string): [number, number] | null;
}

declare global {
  interface Window {
    diorama?: Diorama;
  }
}

export function exposeDiorama(parts: {
  board: Board;
  view: BoardCamera;
  sprites: SpriteLayer;
  state: BoardState;
  ready: () => boolean;
}): void {
  const { board, view, sprites, state } = parts;
  const screen = (point: Vector3): { x: number; y: number } => {
    const { x, y } = view.screenPoint(point);
    return { x, y };
  };
  window.diorama = Object.freeze({
    get ready() {
      return parts.ready();
    },
    squareScreen(x: number, z: number) {
      return screen(standPoint(board, { x, z }));
    },
    spriteScreen(id: string) {
      const sprite = sprites.get(id);
      if (!sprite) return null;
      const middle = sprite.mesh.position.clone();
      middle.y += sprite.height / 2;
      return screen(middle);
    },
    spriteSquare(id: string): [number, number] | null {
      const square = state.squareOf(id);
      const sprite = sprites.get(id);
      if (!square || !sprite) return null;
      const rest = standPoint(board, square);
      return sprite.mesh.position.distanceTo(rest) < 1e-6
        ? [square.x, square.z]
        : null;
    },
  });
}
