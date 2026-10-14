import { Color, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Board } from "../shared/scene.js";
import { columnTop, GRID_LINE } from "./board.js";
import type { Square } from "./picking.js";

/** A free square glows green, an occupied one red. */
export type Glow = "free" | "occupied";

const COLORS: Record<Glow, Color> = {
  free: new Color("#5fd35a"),
  occupied: new Color("#e5483f"),
};
/** The glow is this far above the column top, so it shows over the top face. */
const RAISE = 0.01;
const OPACITY = 0.55;

/**
 * One flat quad on the top of a square: the drop target of a drag. It casts no
 * shadow. A taller column in front of it still hides it.
 */
export class SquareHighlight {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;

  constructor(private readonly board: Board) {
    // The quad fills the top inside its grid lines.
    const side = 1 - 2 * GRID_LINE;
    const geometry = new PlaneGeometry(side, side).rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: OPACITY,
      depthWrite: false,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = "highlight";
    // It draws after the board and the sprites.
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  show({ x, z }: Square, glow: Glow): void {
    const top = columnTop(Number(this.board.heights[z][x]));
    this.mesh.position.set(x + 0.5, top + RAISE, z + 0.5);
    this.mesh.material.color.copy(COLORS[glow]);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}
