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
import { across, step } from "./riser.js";

/** Warm gold: it shows on stone, grass and water, and next to the green and red glows. */
const COLOR = "#f2c14e";
/** The line is this far above the column tops, above the glow of the target square. */
const RAISE = 0.03;
/** The radius of the dot on each square of the route, in board units. */
const DOT_RADIUS = 0.15;
const DOT_SEGMENTS = 16;
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
    const x = Math.max(
      0,
      left ? at.x + LABEL_GAP : at.x - LABEL_GAP - offsetWidth,
    );
    const y = Math.max(
      0,
      above ? at.y - LABEL_GAP - offsetHeight : at.y + LABEL_GAP,
    );
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
      const { near, far, risers } = step(p, q);
      flat(p, near);
      for (const riser of risers) quad(...riser);
      flat(far, q);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    return geometry;
  }
}
