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
import type { Point } from "./press.js";
import type { SquareHighlight } from "./highlight.js";
import { pickSquare, type Square } from "./picking.js";
import { standPoint, type SpriteLayer } from "./sprites.js";

/** The height of a dragged sprite above the column top under it, in board units. */
export const LIFT = 0.5;
/** The height over a square another sprite holds, so the dragged sprite does not hide it. */
export const LIFT_OCCUPIED = 1;
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

/**
 * What a press took: the sprite, and where its foot is from the pointer
 * (`offset`, in CSS pixels) at the zoom of that moment. The drag aims the
 * foot, not the pointer, so the sprite does not jump to the square behind it.
 */
export interface Grab {
  id: string;
  offset: Point;
  zoom: number;
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
    grab: Grab;
    /** The last point of the pointer, so a turn or a zoom can aim again. */
    pointer: Point;
    target: Square | null;
  } | null = null;
  private settle: Settle | null = null;

  constructor(private readonly parts: DragParts) {}

  /** What a press at the canvas point `at` takes: the sprite under it, or null. */
  grab(at: Point): Grab | null {
    const { board, view, sprites, state } = this.parts;
    const id = sprites.spriteAt(view.ray(at.x, at.y));
    const from = id === null ? undefined : state.squareOf(id);
    if (id === null || !from) return null;
    const foot = view.screenPoint(standPoint(board, from));
    return {
      id,
      offset: { x: foot.x - at.x, y: foot.y - at.y },
      zoom: view.camera.zoom,
    };
  }

  /** The square the sprite aims at now, or null off the board. */
  target(): Square | null {
    return this.drag?.target ? { ...this.drag.target } : null;
  }

  start(grab: Grab, at: Point): void {
    const { sprites, state, scene } = this.parts;
    const { id } = grab;
    const sprite = sprites.get(id);
    const from = state.squareOf(id);
    if (!sprite || !from) return;
    this.finishSettle();
    const ghost = new Mesh(sprite.mesh.geometry, GHOST_MATERIAL);
    ghost.name = `ghost:${id}`;
    ghost.position.copy(sprite.mesh.position);
    ghost.rotation.y = sprite.mesh.rotation.y;
    scene.add(ghost);
    this.drag = {
      id,
      mesh: sprite.mesh,
      from,
      ghost,
      grab,
      pointer: at,
      target: from,
    };
    // The first target is the start square, whatever a taller column in front
    // of its foot hides. Off the board, the sprite stays at its last square.
    this.aim(id, from);
    this.lift(from);
    this.parts.requestDraw();
  }

  move(at: Point): void {
    if (!this.drag) return;
    this.drag.pointer = at;
    this.retarget();
  }

  /**
   * Aims at the square under the foot of the sprite: the point of the pointer
   * and the grab offset, which grows and shrinks with the zoom. It does
   * nothing when the square is the same.
   */
  private retarget(): void {
    const drag = this.drag;
    if (!drag) return;
    const { board, view } = this.parts;
    const scale = view.camera.zoom / drag.grab.zoom;
    const { pointer, grab } = drag;
    const square = pickSquare(
      board,
      view.ray(
        pointer.x + grab.offset.x * scale,
        pointer.y + grab.offset.y * scale,
      ),
    );
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
   * Moves a drop or a return on to the time `now`, turns the ghost to the
   * camera, and aims again, as a turn, a zoom or a resize moves the board
   * under a pointer that did not move. Call it on each draw. It returns true
   * while a sprite still moves.
   */
  frame(now: number, azimuth: number): boolean {
    if (this.drag) {
      this.drag.ghost.rotation.y = azimuth;
      this.retarget();
    }
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

  /** Puts the dragged sprite above the center of `square`, higher over a sprite. */
  private lift(square: Square): void {
    const drag = this.drag;
    if (!drag) return;
    const { board, state } = this.parts;
    const free = state.canMove(drag.id, square);
    standPoint(board, square, drag.mesh.position).y += free
      ? LIFT
      : LIFT_OCCUPIED;
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
