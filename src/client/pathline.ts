import { BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial } from "three";
import type { Board, Square } from "../shared/scene.js";
import { pathGeometry } from "./pathgeometry.js";

/** Warm gold: it shows on stone, grass and water, and next to the green and red glows. */
const COLOR = "#f2c14e";

/**
 * The route of a drag on the board: a dot on the top of each square of the
 * route, and a line between them, with a riser where the height changes
 * (`pathGeometry`). It casts no shadow. A taller column in front of it hides it.
 */
export class PathLine {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The squares of the geometry now in the mesh. */
  private squares: readonly Square[] = [];

  constructor(private readonly board: Board) {
    this.mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({
        color: COLOR,
        // Transparent things draw after the opaque ones, so with its render
        // order the line draws after the glow (1, 2), on top of it.
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.name = "path";
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    // The line is on the board, which is in the view. Without this, each new
    // route makes three.js find the bounds of its geometry again.
    this.mesh.frustumCulled = false;
  }

  /** Shows the line through `squares`. It makes the geometry again only for other squares. */
  show(squares: readonly Square[]): void {
    this.mesh.visible = true;
    if (sameSquares(squares, this.squares)) return;
    this.squares = squares;
    this.mesh.geometry.dispose();
    this.mesh.geometry = pathGeometry(this.board, squares);
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

function sameSquares(a: readonly Square[], b: readonly Square[]): boolean {
  return (
    a.length === b.length && a.every((s, i) => s.x === b[i].x && s.z === b[i].z)
  );
}
