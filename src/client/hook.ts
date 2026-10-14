import { Vector3 } from "three";
import type { Board } from "../shared/scene.js";
import type { Diorama } from "../shared/diorama.js";
import { standPoint } from "./board.js";
import type { BoardState } from "./board-state.js";
import type { BoardCamera } from "./camera.js";
import type { SpriteDrag } from "./drag.js";
import type { SpriteLayer } from "./sprites.js";

declare global {
  interface Window {
    diorama?: Diorama;
  }
}

/** Puts the read-only view of the board (`Diorama`) on `window.diorama`. */
export function exposeDiorama(parts: {
  board: Board;
  view: BoardCamera;
  sprites: SpriteLayer;
  state: BoardState;
  drag: SpriteDrag;
  ready: () => boolean;
}): void {
  const { board, view, sprites, state, drag } = parts;
  const screen = (point: Vector3): { x: number; y: number } => {
    const { x, y } = view.screenPoint(point);
    return { x, y };
  };
  window.diorama = Object.freeze({
    get ready() {
      return parts.ready();
    },
    squareScreen(x: number, z: number) {
      if (!state.onBoard({ x, z })) return null;
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
      if (drag.busy() || !square || !sprites.get(id)) return null;
      return [square.x, square.z];
    },
    dragTarget(): [number, number] | null {
      const square = drag.target();
      return square ? [square.x, square.z] : null;
    },
    dragPath() {
      return drag.route();
    },
  });
}
