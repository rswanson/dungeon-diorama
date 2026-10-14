import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { routeLabel, type DragRoute, type Square } from "../shared/path.js";
import type { Board } from "../shared/scene.js";
import { standPoint } from "./board.js";
import type { Point } from "./point.js";

/** Warm gold: it shows on stone, grass and water, and next to the green and red glows. */
const COLOR = "#f2c14e";
/** The line is this far above the column tops, above the glow of the target square. */
const RAISE = 0.03;
/** The width of the line, in board units. */
const WIDTH = 0.1;
/** The radius of the dot on each square of the route, in board units. */
const DOT_RADIUS = 0.15;
const DOT_SEGMENTS = 16;
/**
 * A step up or down is a vertical part of the line at the edge between the
 * two squares, this far over the lower square, so it does not touch the side
 * of the higher column.
 */
const EDGE_GAP = 0.02;
/** The space between the pointer and the label, in CSS pixels, so a finger does not hide it. */
const LABEL_GAP = 24;

/**
 * The route of a drag on the board: a dot on the top of each square of the
 * route, and a line between them. Where the next top is higher or lower, the
 * line goes straight up or down at the edge between the two squares, as a
 * step. It casts no shadow. A taller column in front of it hides it. The
 * label near the pointer gives the feet of the route, or "No path".
 */
export class PathLine {
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly label: HTMLElement;

  constructor(
    private readonly board: Board,
    parent: HTMLElement = document.body,
  ) {
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

    this.label = document.createElement("div");
    this.label.className = "board-label path-label";
    this.label.setAttribute("aria-live", "polite");
    this.label.hidden = true;
    parent.append(this.label);
  }

  /** Shows `route`: the line for a route, and the label for a route or "none". */
  show(route: DragRoute): void {
    const text = routeLabel(route);
    this.label.hidden = text === null;
    this.label.textContent = text ?? "";
    this.mesh.visible = route !== null && route !== "none";
    if (route === null || route === "none") return;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.geometry(route.squares);
  }

  /**
   * Puts the label above and to the right of the canvas point `at`, or to the
   * left of it or below it where the window has no room.
   */
  follow(at: Point): void {
    if (this.label.hidden) return;
    const { offsetWidth, offsetHeight } = this.label;
    const left = at.x + LABEL_GAP + offsetWidth <= window.innerWidth;
    const above = at.y - LABEL_GAP - offsetHeight >= 0;
    const x = left ? at.x + LABEL_GAP : at.x - LABEL_GAP - offsetWidth;
    const y = above ? at.y - LABEL_GAP - offsetHeight : at.y + LABEL_GAP;
    this.label.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide(): void {
    this.mesh.visible = false;
    this.label.hidden = true;
  }

  /** The dots and the line of the route through `squares`, in board units. */
  private geometry(squares: Square[]): BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3): void => {
      const start = positions.length / 3;
      for (const p of [a, b, c, d]) positions.push(p.x, p.y, p.z);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };
    // A flat part of the line from p to q, both at the same height.
    const flat = (p: Vector3, q: Vector3): void => {
      const side = across(p, q);
      quad(
        p.clone().add(side),
        q.clone().add(side),
        q.clone().sub(side),
        p.clone().sub(side),
      );
    };

    const tops = squares.map((square) => {
      const top = standPoint(this.board, square);
      top.y += RAISE;
      return top;
    });
    for (const top of tops) {
      const centre = positions.length / 3;
      positions.push(top.x, top.y, top.z);
      for (let i = 0; i < DOT_SEGMENTS; i++) {
        const angle = (i / DOT_SEGMENTS) * Math.PI * 2;
        positions.push(
          top.x + Math.cos(angle) * DOT_RADIUS,
          top.y,
          top.z + Math.sin(angle) * DOT_RADIUS,
        );
        indices.push(
          centre,
          centre + 1 + i,
          centre + 1 + ((i + 1) % DOT_SEGMENTS),
        );
      }
    }
    for (let i = 1; i < tops.length; i++) {
      const p = tops[i - 1];
      const q = tops[i];
      if (p.y === q.y) {
        flat(p, q);
        continue;
      }
      // The step is at the edge (or the corner) between the two squares, moved
      // a little over the lower square.
      const edge = p.clone().lerp(q, 0.5);
      const towardLower = q.clone().sub(p).setY(0).normalize();
      if (q.y > p.y) towardLower.negate();
      edge.addScaledVector(towardLower, EDGE_GAP);
      const near = edge.clone().setY(p.y);
      const far = edge.clone().setY(q.y);
      flat(p, near);
      const side = across(p, q);
      quad(
        near.clone().add(side),
        far.clone().add(side),
        far.clone().sub(side),
        near.clone().sub(side),
      );
      flat(far, q);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }
}

/** Half the width of the line, flat and at a right angle to the way from p to q. */
function across(p: Vector3, q: Vector3): Vector3 {
  const way = q.clone().sub(p).setY(0).normalize();
  return new Vector3(-way.z, 0, way.x).multiplyScalar(WIDTH / 2);
}
