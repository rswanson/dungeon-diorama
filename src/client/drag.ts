import {
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Object3D,
} from "three";
import type { Board } from "../shared/scene.js";
import type { BoardState } from "./board-state.js";
import type { BoardCamera } from "./camera.js";
import type { PressPoint as Point } from "./press.js";
import type { SquareHighlight } from "./highlight.js";
import { pickSquare, type Square } from "./picking.js";
import { standPoint, type SpriteLayer } from "./sprites.js";

/** The height of a dragged sprite above the column top under it, in board units. */
export const LIFT = 0.5;
/** The time of the drop onto a new square, and of the way back to the start square, in milliseconds. */
export const DROP_MS = 150;
export const RETURN_MS = 200;

/** The ghost outline on the start square: a pale, see-through copy of the sprite. */
const GHOST_MATERIAL = new MeshBasicMaterial({
  color: "#e8dcc0",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

/** What a drop does: the sprite moves to `to`, or goes back to its start square. */
export type DropOutcome = { kind: "move"; to: Square } | { kind: "back" };

/**
 * The outcome of a drop of sprite `id` on `to` (null when the pointer is off
 * the board). A free square moves the sprite there. An occupied square, no
 * square and its own square send it back to its start square.
 */
export function dropOutcome(
  state: BoardState,
  id: string,
  to: Square | null,
): DropOutcome {
  const from = state.squareOf(id);
  if (!to || !from || !state.canMove(id, to)) return { kind: "back" };
  if (to.x === from.x && to.z === from.z) return { kind: "back" };
  return { kind: "move", to };
}

export interface DragParts {
  board: Board;
  view: BoardCamera;
  sprites: SpriteLayer;
  state: BoardState;
  highlight: SquareHighlight;
  /** The ghost goes in here. */
  scene: Object3D;
  requestDraw(): void;
}

/** A sprite that moves to its square by itself, after a drop or a cancel. */
interface Settle {
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  start: number;
  ms: number;
}

/**
 * The drag of a sprite: it lifts and follows the pointer from square to
 * square, a ghost stays on the start square, and the target square glows. The
 * drop puts the sprite on a free square or back on its start square. Moves are
 * not saved yet.
 */
export class SpriteDrag {
  private drag: {
    id: string;
    mesh: Mesh;
    from: Square;
    ghost: Mesh;
    target: Square | null;
  } | null = null;
  private settle: Settle | null = null;

  constructor(private readonly parts: DragParts) {}

  /** The id of the sprite under the canvas point `at`, or null. */
  grab(at: Point): string | null {
    const { view, sprites, state } = this.parts;
    const id = sprites.spriteAt(view.ray(at.x, at.y));
    return id !== null && state.squareOf(id) ? id : null;
  }

  start(id: string, at: Point): void {
    const { sprites, state, scene } = this.parts;
    const sprite = sprites.get(id);
    const from = state.squareOf(id);
    if (!sprite || !from) return;
    this.finishSettle();
    const ghost = new Mesh(sprite.mesh.geometry, GHOST_MATERIAL);
    ghost.name = `ghost:${id}`;
    ghost.position.copy(sprite.mesh.position);
    ghost.rotation.y = sprite.mesh.rotation.y;
    scene.add(ghost);
    this.drag = { id, mesh: sprite.mesh, from, ghost, target: null };
    // Off the board, the sprite stays lifted above its start square.
    this.lift(from);
    this.move(at);
    this.parts.requestDraw();
  }

  move(at: Point): void {
    const drag = this.drag;
    if (!drag) return;
    const { board, view } = this.parts;
    const square = pickSquare(board, view.ray(at.x, at.y));
    if (sameSquare(square, drag.target)) return;
    drag.target = square;
    this.aim(drag.id, square);
    // Off the board, the sprite stays at its last square on the board.
    if (square) this.lift(square);
    this.parts.requestDraw();
  }

  drop(at: Point): void {
    const drag = this.drag;
    if (!drag) return;
    this.move(at);
    this.end();
    this.onDrop(drag.id, drag.from, drag.target);
  }

  cancel(): void {
    const drag = this.drag;
    if (!drag) return;
    this.end();
    this.settleOn(drag.mesh, drag.from, RETURN_MS);
  }

  /**
   * Moves a drop or a return on to the time `now`, and turns the ghost to the
   * camera. Call it on each draw. It returns true while a sprite still moves.
   */
  frame(now: number, azimuth: number): boolean {
    if (this.drag) this.drag.ghost.rotation.y = azimuth;
    return this.step(now);
  }

  /** Moves a drop or a return on to the time `now`. It returns true while it goes on. */
  private step(now: number): boolean {
    const settle = this.settle;
    if (!settle) return false;
    const t = MathUtils.clamp((now - settle.start) / settle.ms, 0, 1);
    // Ease out: fast at the start, slow onto the square.
    settle.mesh.position.lerpVectors(settle.from, settle.to, 1 - (1 - t) ** 3);
    settle.mesh.updateMatrixWorld();
    if (t < 1) return true;
    this.settle = null;
    return false;
  }

  /** The square under the pointer changed. B6 adds the path line here. */
  private aim(id: string, square: Square | null): void {
    const { highlight, state } = this.parts;
    if (!square) {
      highlight.hide();
      return;
    }
    highlight.show(square, state.canMove(id, square) ? "free" : "occupied");
  }

  /**
   * The one way a drop ends: the board state moves the sprite to a free
   * square, or the sprite goes back to `from`. B7 saves the move here.
   */
  private onDrop(id: string, from: Square, to: Square | null): void {
    const sprite = this.parts.sprites.get(id);
    if (!sprite) return;
    const outcome = dropOutcome(this.parts.state, id, to);
    if (outcome.kind === "move") {
      this.parts.state.move(id, outcome.to);
      this.settleOn(sprite.mesh, outcome.to, DROP_MS);
    } else {
      this.settleOn(sprite.mesh, from, RETURN_MS);
    }
  }

  /** Puts the dragged sprite above the center of `square`. */
  private lift(square: Square): void {
    const drag = this.drag;
    if (!drag) return;
    standPoint(this.parts.board, square, drag.mesh.position).y += LIFT;
    drag.mesh.updateMatrixWorld();
  }

  /** Takes away the ghost and the glow. The sprite stays where it is. */
  private end(): void {
    const drag = this.drag;
    if (!drag) return;
    this.parts.scene.remove(drag.ghost);
    this.aim(drag.id, null);
    this.drag = null;
  }

  private settleOn(mesh: Mesh, square: Square, ms: number): void {
    this.finishSettle();
    this.settle = {
      mesh,
      from: mesh.position.clone(),
      to: standPoint(this.parts.board, square),
      start: performance.now(),
      ms,
    };
    this.parts.requestDraw();
  }

  /** Puts a sprite that still moves at the end of its move at once. */
  private finishSettle(): void {
    this.step(Infinity);
  }
}

function sameSquare(a: Square | null, b: Square | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.z === b.z);
}
