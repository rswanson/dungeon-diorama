import {
  Mesh,
  MeshBasicMaterial,
  Ray,
  Vector2,
  Vector3,
  type Object3D,
} from "three";
import {
  dragRoute,
  isRoute,
  routeLabel,
  type DragRoute,
  type Grid,
} from "../shared/path.js";
import type { Layout } from "../shared/positions.js";
import type { Board, Square } from "../shared/scene.js";
import { standPoint } from "./board.js";
import type { BoardState } from "./board-state.js";
import { easeOut, type BoardCamera } from "./camera.js";
import type { SquareHighlight } from "./highlight.js";
import type { PathLine } from "./pathline.js";
import type { Point } from "./point.js";
import { pickSquare } from "./picking.js";
import type { SpriteLayer } from "./sprites.js";

/** The height of a dragged sprite above the column top under it, in board units, or above the sprite on it. */
export const LIFT = 0.5;
/** The time of the move of a sprite onto its square after a drop or a cancel, in milliseconds. */
export const SETTLE_MS = 150;
/**
 * While the pointer is this near the press point, the drag aims at the start
 * square. It is in board units across the view, so on the screen it follows
 * the zoom and the size of the view.
 */
export const HOME_RADIUS = 0.5;

/** The ghost outline on the start square: a pale, see-through copy of the sprite. */
const GHOST_MATERIAL = new MeshBasicMaterial({
  color: "#e8dcc0",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

/**
 * What a press took: the sprite, the height of the grab point above its foot
 * (`lift`, in board units), and the press point on the sprite at rest
 * (`world`, in board units). The drag aims the grab point dropped by that
 * height, so the sprite does not jump to the square behind it. The home
 * radius is centered on `world`, so it stays on the start square when the
 * view turns, zooms, pans or resizes.
 */
interface Grab {
  id: string;
  lift: number;
  world: Vector3;
}

/** The label near the pointer that gives the feet of the route. `BoardLabel` is one. */
export interface RouteLabel {
  /** Shows `text` near the canvas point `at`. */
  showAt(text: string, at: Point): void;
  /** Moves the label near the canvas point `at`. */
  moveTo(at: Point): void;
  hide(): void;
}

interface DragParts {
  board: Board;
  view: BoardCamera;
  sprites: SpriteLayer;
  state: BoardState;
  highlight: SquareHighlight;
  path: PathLine;
  label: RouteLabel;
  /** The ghost goes in here. */
  scene: Object3D;
  requestDraw(): void;
  /**
   * Saves the move of sprite `id` to `to`. It resolves with `ok` true when the
   * move saved. A save that did not may give the server's `positions`, which
   * the board then shows. Without `save`, nothing saves.
   */
  save?(id: string, to: Square): Promise<{ ok: boolean; positions?: Layout }>;
}

/** A sprite that moves to its square by itself, after a drop or a cancel. */
interface Settle {
  id: string;
  mesh: Mesh;
  from: Vector3;
  to: Vector3;
  start: number;
}

/**
 * The drag of a sprite: it lifts and follows the pointer from square to
 * square, a ghost stays on the start square, the target square glows, and a
 * line shows the route to it with its length in feet. The
 * drop puts the sprite on a free square or back on its start square. A move to
 * another square saves (`save`). The sprite stands on its new square at once,
 * and goes back to its start square when the save fails. One move saves at a
 * time: until its save ends, a press takes no sprite.
 */
export class SpriteDrag {
  private drag: {
    mesh: Mesh;
    from: Square;
    ghost: Mesh;
    grab: Grab;
    /** The last point of the pointer, so a turn or a zoom can aim again. */
    pointer: Point;
    target: Square | null;
    /** The squares the route goes around: the squares of the other sprites. */
    grid: Grid;
    /** The route to the target, which the path line shows. */
    route: DragRoute;
  } | null = null;
  private settle: Settle | null = null;
  /** The id of the sprite whose move still saves, or null. */
  private saving: string | null = null;
  private readonly aim = new Ray();
  private readonly centre = new Vector2();

  constructor(private readonly parts: DragParts) {}

  /**
   * What a press at the canvas point `at` takes: the sprite under it, or null.
   * It does not take a sprite that still moves onto its square, as the lift
   * needs the sprite at rest. While a move saves, it takes no sprite, as a
   * failed save puts that sprite back on its start square.
   */
  grab(at: Point): Grab | null {
    if (this.drag || this.saving !== null) return null;
    const { board, view, sprites, state } = this.parts;
    const hit = sprites.spriteAt(view.ray(at.x, at.y));
    const from = hit && state.squareOf(hit.id);
    if (!hit || !from || hit.id === this.settle?.id) return null;
    return {
      id: hit.id,
      lift: hit.point.y - standPoint(board, from).y,
      world: hit.point.clone(),
    };
  }

  /** The square the sprite aims at now, or null off the board. */
  target(): Square | null {
    return this.drag?.target ? { ...this.drag.target } : null;
  }

  /** What the path line shows now: a route, "none", or null when no drag runs or it shows nothing. */
  route(): DragRoute {
    return this.drag?.route ?? null;
  }

  /** True while a drag runs, a sprite still moves onto its square, or a move still saves. */
  busy(): boolean {
    return this.drag !== null || this.settle !== null || this.saving !== null;
  }

  start(grab: Grab, at: Point): void {
    const { sprites, state, scene } = this.parts;
    const sprite = sprites.get(grab.id);
    const from = state.squareOf(grab.id);
    if (!sprite || !from) return;
    const ghost = new Mesh(sprite.mesh.geometry, GHOST_MATERIAL);
    ghost.name = `ghost:${grab.id}`;
    ghost.position.copy(sprite.mesh.position);
    ghost.rotation.y = sprite.mesh.rotation.y;
    scene.add(ghost);
    this.drag = {
      mesh: sprite.mesh,
      from,
      ghost,
      grab,
      pointer: at,
      target: from,
      grid: this.grid(grab.id),
      route: null,
    };
    this.show(from);
    this.retarget();
    this.parts.requestDraw();
  }

  move(at: Point): void {
    if (!this.drag) return;
    this.drag.pointer = at;
    this.retarget();
    this.parts.label.moveTo(at);
  }

  /**
   * Aims the drag from the pointer, each time it moves and on each frame.
   *
   * - While the pointer is in `HOME_RADIUS` of the press point on the screen
   *   (the grab point of the sprite at rest, projected on each call), it aims
   *   at the start square, also where a taller column in front hides it.
   * - Out of that radius, it aims at the square under the grab point dropped
   *   by its lift: the first column top that the ray of the pointer, moved
   *   down by the lift (`aim`), comes down on. `aim` goes through the sides
   *   of taller columns, as a sprite stands only on a top. The camera is
   *   orthographic, so this holds at each zoom, turn and size.
   *
   * It does nothing when the square is the same.
   */
  private retarget(): void {
    const drag = this.drag;
    if (!drag) return;
    const { board, view } = this.parts;
    const { pointer, grab, from } = drag;
    const centre = view.screenPoint(grab.world, this.centre);
    const home =
      Math.hypot(pointer.x - centre.x, pointer.y - centre.y) <=
      view.unitsToPixels(HOME_RADIUS);
    let square: Square | null = from;
    if (!home) {
      this.aim.copy(view.ray(pointer.x, pointer.y));
      this.aim.origin.y -= grab.lift;
      square = pickSquare(board, this.aim, { tops: true });
    }
    if (sameSquare(square, drag.target)) return;
    drag.target = square;
    this.show(square);
    this.parts.requestDraw();
  }

  drop(at: Point): void {
    const drag = this.drag;
    if (!drag) return;
    this.move(at);
    this.end();
    this.onDrop(drag.grab.id, drag.target);
  }

  cancel(): void {
    const drag = this.drag;
    if (!drag) return;
    this.end();
    this.settleOn(drag.grab.id, drag.mesh, drag.from);
  }

  /**
   * Moves a settle on to the time `now`, turns the ghost to the camera, and
   * aims again, as a turn, a zoom or a resize moves the board under a pointer
   * that did not move. Call it on each draw. It returns true while a sprite
   * still moves.
   */
  frame(now: number, azimuth: number): boolean {
    if (this.drag) {
      this.drag.ghost.rotation.y = azimuth;
      this.retarget();
    }
    return this.step(now);
  }

  /** Moves a settle on to the time `now`. It returns true while it goes on. */
  private step(now: number): boolean {
    const settle = this.settle;
    if (!settle) return false;
    const t = (now - settle.start) / SETTLE_MS;
    settle.mesh.position.lerpVectors(settle.from, settle.to, easeOut(t));
    settle.mesh.updateMatrixWorld();
    if (t < 1) return true;
    this.settle = null;
    return false;
  }

  /**
   * Shows the target `square`: it glows, green when it is free and red when
   * another sprite holds it, and the dragged sprite goes above its center,
   * also above the sprite on it. Off the board (null), the glow goes and the
   * sprite stays at its last square. The path line shows the route to it
   * (`dragRoute`), and the label near the pointer its feet or "No path".
   */
  private show(square: Square | null): void {
    const drag = this.drag;
    if (!drag) return;
    const { board, sprites, state, highlight, path, label } = this.parts;
    drag.route = dragRoute(drag.grid, drag.from, square);
    if (isRoute(drag.route)) {
      path.show(drag.route.squares);
    } else {
      path.hide();
    }
    const text = routeLabel(drag.route);
    if (text === null) {
      label.hide();
    } else {
      label.showAt(text, drag.pointer);
    }
    if (!square) {
      highlight.hide();
      return;
    }
    const free = state.canMove(drag.grab.id, square);
    highlight.show(square, free ? "free" : "occupied");
    const other = free ? null : state.occupant(square.x, square.z);
    const under = other === null ? 0 : (sprites.get(other)?.height ?? 0);
    standPoint(board, square, drag.mesh.position).y += LIFT + under;
    drag.mesh.updateMatrixWorld();
  }

  /**
   * The one way a drop ends: the sprite moves to `to` when it is free, or
   * goes back to its start square. A move to its own square changes nothing.
   * A move to another square saves.
   */
  private onDrop(id: string, to: Square | null): void {
    const { sprites, state } = this.parts;
    const sprite = sprites.get(id);
    const from = state.squareOf(id);
    if (!sprite || !from) return;
    const dest = to && state.canMove(id, to) ? to : from;
    state.move(id, dest);
    this.settleOn(id, sprite.mesh, dest);
    if (!sameSquare(dest, from)) this.store(id, from, dest);
  }

  /**
   * Saves the move of sprite `id` from `from` to `to`. When the save fails,
   * the sprite goes back to `from`, and the board shows the positions that
   * the save gives, if any. No sprite moves until the save ends (`grab`), so
   * `from` is still free then.
   */
  private store(id: string, from: Square, to: Square): void {
    const { save, state } = this.parts;
    if (!save) return;
    this.saving = id;
    const done = (result: { ok: boolean; positions?: Layout }): void => {
      this.saving = null;
      if (!result.ok) {
        state.move(id, from);
        const sprite = this.parts.sprites.get(id);
        if (sprite) this.settleOn(id, sprite.mesh, from);
        try {
          if (result.positions) this.relayout(result.positions);
        } catch (error) {
          console.warn("The positions of the server do not fit:", error);
        }
      }
      this.parts.requestDraw();
    };
    save(id, to).then(done, () => done({ ok: false }));
  }

  /**
   * Puts each sprite on its square in `layout` at once, for example the
   * positions that the server gives when a save fails. A drag that runs ends
   * first, as a cancel does. It throws when `layout` puts a sprite off the
   * board or two sprites on one square, and the sprites keep their squares.
   */
  relayout(layout: Readonly<Record<string, readonly [number, number]>>): void {
    const { board, sprites, state } = this.parts;
    this.cancel();
    this.finishSettle();
    state.place(layout);
    for (const id of Object.keys(layout)) {
      const sprite = sprites.get(id);
      const square = state.squareOf(id);
      if (!sprite || !square) continue;
      standPoint(board, square, sprite.mesh.position);
      sprite.mesh.updateMatrixWorld();
    }
    this.parts.requestDraw();
  }

  /** Takes away the ghost, the glow, the path line and its label. The sprite stays where it is. */
  private end(): void {
    const drag = this.drag;
    if (!drag) return;
    this.parts.scene.remove(drag.ghost);
    this.parts.highlight.hide();
    this.parts.path.hide();
    this.parts.label.hide();
    this.drag = null;
  }

  /**
   * The board for the route of sprite `id`: the squares of the other sprites
   * are blocked. No sprite moves during a drag, so it is made once at the start.
   */
  private grid(id: string): Grid {
    const { width, depth } = this.parts.board;
    const blocked = this.parts.state.occupiedExcept(id);
    return { width, depth, blocked: (x, z) => blocked[z * width + x] === 1 };
  }

  /** Starts the move of sprite `id` onto `square`. A move that still runs ends at once. */
  private settleOn(id: string, mesh: Mesh, square: Square): void {
    this.finishSettle();
    this.settle = {
      id,
      mesh,
      from: mesh.position.clone(),
      to: standPoint(this.parts.board, square),
      start: performance.now(),
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
