import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from "three";
import type { Board } from "../shared/scene.js";
import { columnTop, GRID_LINE } from "./board.js";
import type { Square } from "./picking.js";

/** A free square glows green, an occupied one red. */
export type Glow = "free" | "occupied";

const COLORS: Record<Glow, Color> = {
  free: new Color("#5fd35a"),
  occupied: new Color("#e5483f"),
};
const WHITE = new Color("#ffffff");
/** The glow is this far above the column top, so it shows over the top face. */
const RAISE = 0.01;
/** The fill is see-through, so the square under it shows. The frame is sharper. */
const FILL_OPACITY = 0.45;
const FRAME_OPACITY = 0.95;
/** The frame is this much lighter than the fill: this part of the way to white. */
const FRAME_LIGHTER = 0.3;
/** The width of the frame, in board units. */
const FRAME_WIDTH = 0.09;

/**
 * The drop target of a drag, flat on the top of a square: a filled square and
 * a brighter frame at its edges, inside the grid lines. A sprite on the square
 * hides the fill under its feet, and the frame still shows around them. It
 * casts no shadow. A taller column in front of it still hides it.
 */
export class SquareHighlight {
  readonly mesh = new Group();
  private readonly fill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly frame: Mesh<ShapeGeometry, MeshBasicMaterial>;

  constructor(private readonly board: Board) {
    // Both fill the top inside its grid lines.
    const side = 1 - 2 * GRID_LINE;
    this.fill = new Mesh(
      new PlaneGeometry(side, side).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        transparent: true,
        opacity: FILL_OPACITY,
        depthWrite: false,
      }),
    );
    this.frame = new Mesh(
      frameGeometry(side, FRAME_WIDTH),
      new MeshBasicMaterial({
        transparent: true,
        opacity: FRAME_OPACITY,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.frame.position.y = RAISE;
    // They draw after the board and the sprites, the frame on the fill.
    this.fill.renderOrder = 1;
    this.frame.renderOrder = 2;
    this.mesh.name = "highlight";
    this.mesh.add(this.fill, this.frame);
    this.mesh.visible = false;
  }

  show({ x, z }: Square, glow: Glow): void {
    const top = columnTop(Number(this.board.heights[z][x]));
    this.mesh.position.set(x + 0.5, top + RAISE, z + 0.5);
    this.fill.material.color.copy(COLORS[glow]);
    this.frame.material.color.copy(COLORS[glow]).lerp(WHITE, FRAME_LIGHTER);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

/** A flat square ring of this outer side and width, centered on the origin, facing up. */
function frameGeometry(side: number, width: number): ShapeGeometry {
  const half = side / 2;
  const inner = half - width;
  const ring = new Shape()
    .moveTo(-half, -half)
    .lineTo(half, -half)
    .lineTo(half, half)
    .lineTo(-half, half)
    .lineTo(-half, -half);
  ring.holes.push(
    new Shape()
      .moveTo(-inner, -inner)
      .lineTo(-inner, inner)
      .lineTo(inner, inner)
      .lineTo(inner, -inner)
      .lineTo(-inner, -inner),
  );
  return new ShapeGeometry(ring).rotateX(-Math.PI / 2);
}
