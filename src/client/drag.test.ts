import { readFileSync } from "node:fs";
import { Box3, Object3D, Vector3, type Ray } from "three";
import { describe, expect, it } from "vitest";
import { spritePixels } from "../../scripts/sprites.js";
import { isRoute } from "../shared/path.js";
import {
  parseScene,
  type Board,
  type Square,
  type SpriteSpec,
} from "../shared/scene.js";
import { createBoardMesh, standPoint } from "./board.js";
import { BoardState } from "./board-state.js";
import { BoardCamera, TURN_MS } from "./camera.js";
import {
  HOME_RADIUS,
  LIFT,
  SETTLE_MS,
  SpriteDrag,
  type RouteLabel,
} from "./drag.js";
import { SquareHighlight } from "./highlight.js";
import { PathLine } from "./pathline.js";
import { pickSquare } from "./picking.js";
import type { Point } from "./point.js";
import {
  MAX_HEIGHT,
  SpriteLayer,
  VOXEL,
  voxelsFromPixels,
  type SpriteVoxels,
} from "./sprites.js";

/** The size of the view, as the Playwright test's window. */
const [W, H] = [1280, 720];
/** The move of the pointer that starts a drag, just past the click slop. */
const NUDGE = 6;

/** The voxels of a solid sprite image of this size, in pixels. */
function solid(width: number, height: number): SpriteVoxels {
  const rgba = Array.from({ length: width * height }, () => [
    200, 50, 50, 255,
  ]).flat();
  return { width, voxels: voxelsFromPixels(width, height, rgba) };
}

/** A route label that keeps each call of the drag. */
class RecordingLabel implements RouteLabel {
  /** Each call the drag made, in order: the text it showed, "move" or "hide". */
  readonly calls: string[] = [];
  /** The text the label shows now, or null when it is hidden. */
  text: string | null = null;

  showAt(text: string): void {
    this.calls.push(text);
    this.text = text;
  }

  moveTo(): void {
    this.calls.push("move");
  }

  hide(): void {
    this.calls.push("hide");
    this.text = null;
  }
}

/** The drag and all its parts on `board`, with the view at its start turn. */
function stage(
  board: Board,
  sprites: { spec: SpriteSpec; voxels: SpriteVoxels }[],
  save?: ConstructorParameters<typeof SpriteDrag>[0]["save"],
) {
  const mesh = createBoardMesh(board);
  // As the page does: the view holds the tallest sprite on the highest column.
  const box = new Box3().setFromObject(mesh);
  box.max.y += MAX_HEIGHT * VOXEL;
  const view = new BoardCamera(box);
  view.resize(W, H);
  const layer = new SpriteLayer(board, [mesh]);
  for (const s of sprites) layer.add(s.spec, s.voxels);
  layer.face(view.azimuth);
  const state = new BoardState(
    board,
    sprites.map((s) => s.spec),
  );
  const highlight = new SquareHighlight(board);
  const scene = new Object3D();
  const path = new PathLine(board);
  const label = new RecordingLabel();
  const drag = new SpriteDrag({
    board,
    view,
    sprites: layer,
    state,
    highlight,
    path,
    label,
    scene,
    requestDraw: () => {},
    save,
  });
  let now = 0;
  return {
    view,
    layer,
    state,
    highlight,
    scene,
    path,
    label,
    drag,
    /** The point on the screen of a point of the board. */
    screen(p: Vector3): Point {
      const { x, y } = view.screenPoint(p);
      return { x, y };
    },
    /** The ray of the pointer at `at`, moved down by `lift`, as the drag aims. */
    aim(at: Point, lift: number): Ray {
      const ray = view.ray(at.x, at.y).clone();
      ray.origin.y -= lift;
      return ray;
    },
    /** Turns the view a quarter turn, to its end, and the sprites with it. */
    turn(): void {
      view.rotate(1, now);
      now += TURN_MS;
      view.tick(now);
      layer.face(view.azimuth);
    },
    /** Ends a settle at once. */
    rest(): void {
      drag.frame(Infinity, view.azimuth);
    },
  };
}

const same = (a: Square | null | undefined, b: Square): boolean =>
  a?.x === b.x && a.z === b.z;

/** The point on the screen of a board point, as a `Point`. */
function screenOf(view: BoardCamera, p: Vector3): Point {
  const { x, y } = view.screenPoint(p);
  return { x, y };
}

// Four squares by four. The camera starts on the +x, +z side, so the three
// columns of height 2 at [2, 1], [1, 2] and [2, 2] stand in front of the hero
// on [1, 1] (height 0) and hide its foot. [0, 0] is free. The rat is on [3, 3].
const BOARD: Board = {
  width: 4,
  depth: 4,
  materials: { s: { name: "stone", top: "#888888", side: "#666666" } },
  heights: ["0000", "0020", "0220", "0000"],
  tiles: ["ssss", "ssss", "ssss", "ssss"],
};
const HERO: Square = { x: 1, z: 1 };
const FREE: Square = { x: 0, z: 0 };
const RAT: Square = { x: 3, z: 3 };

const spec = (id: string, { x, z }: Square): SpriteSpec => ({
  id,
  name: id,
  image: `sprites/${id}.png`,
  at: [x, z],
});

describe("SpriteDrag", () => {
  /** The stage and a press on the middle of the hero, 2 units high. */
  function pressHero() {
    const parts = stage(BOARD, [
      { spec: spec("hero", HERO), voxels: solid(16, 32) },
      { spec: spec("rat", RAT), voxels: solid(16, 8) },
    ]);
    const foot = standPoint(BOARD, HERO);
    const at = parts.screen(foot.clone().setY(foot.y + 1));
    const grab = parts.drag.grab(at);
    if (grab?.id !== "hero") throw new Error("The press missed the hero.");
    return {
      ...parts,
      at,
      grab,
      /** The pointer for which the hero aims at the center of `square`. */
      over(square: Square): Point {
        const to = parts.screen(standPoint(BOARD, square));
        const from = parts.screen(foot);
        return { x: to.x + at.x - from.x, y: to.y + at.y - from.y };
      },
    };
  }

  it("starts aiming at the sprite's own square, with its foot hidden", () => {
    const { drag, view, grab, at, aim } = pressHero();
    const moved = { x: at.x + NUDGE, y: at.y };
    // A pick that stops at a side, or at the first top, finds a taller
    // column in front.
    expect(pickSquare(BOARD, aim(moved, grab.lift))).not.toEqual(HERO);
    expect(
      pickSquare(BOARD, aim(moved, grab.lift), { tops: true }),
    ).not.toEqual(HERO);

    drag.start(grab, moved);
    expect(drag.target()).toEqual(HERO);
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(HERO);
  });

  it("lifts the sprite LIFT above a free square it aims at", () => {
    const { drag, layer, highlight, grab, at, over } = pressHero();
    drag.start(grab, at);
    drag.move(over(FREE));
    expect(drag.target()).toEqual(FREE);
    expect(highlight.mesh.visible).toBe(true);
    const stand = standPoint(BOARD, FREE);
    expect(layer.get("hero")?.mesh.position.toArray()).toEqual([
      stand.x,
      stand.y + LIFT,
      stand.z,
    ]);
  });

  it("lifts the sprite LIFT and the occupant's height above an occupied square", () => {
    const { drag, layer, grab, at, over } = pressHero();
    drag.start(grab, at);
    drag.move(over(RAT));
    expect(drag.target()).toEqual(RAT);
    const rat = layer.get("rat")?.height ?? NaN;
    expect(layer.get("hero")?.mesh.position.y).toBeCloseTo(
      standPoint(BOARD, RAT).y + LIFT + rat,
    );
  });

  it("moves the sprite in the board state on a drop on a free square", () => {
    const { drag, state, layer, grab, at, over, rest } = pressHero();
    drag.start(grab, at);
    drag.drop(over(FREE));
    expect(state.squareOf("hero")).toEqual(FREE);
    expect(drag.target()).toBeNull();
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, FREE));
  });

  it("leaves the sprite on its start square on a drop on an occupied square", () => {
    const { drag, state, layer, grab, at, over, rest } = pressHero();
    drag.start(grab, at);
    drag.drop(over(RAT));
    expect(state.squareOf("hero")).toEqual(HERO);
    expect(state.squareOf("rat")).toEqual(RAT);
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });

  it("leaves the sprite on its start square on a drop off the board", () => {
    const { drag, state, highlight, layer, grab, at, rest } = pressHero();
    drag.start(grab, at);
    const off = { x: -W, y: -H };
    drag.move(off);
    expect(drag.target()).toBeNull();
    expect(highlight.mesh.visible).toBe(false);
    drag.drop(off);
    expect(state.squareOf("hero")).toEqual(HERO);
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });

  it("puts the sprite back on a cancel", () => {
    const { drag, state, scene, layer, grab, at, over, rest } = pressHero();
    drag.start(grab, at);
    expect(scene.children).toHaveLength(1);
    drag.move(over(FREE));
    drag.cancel();
    expect(scene.children).toHaveLength(0);
    expect(drag.target()).toBeNull();
    expect(state.squareOf("hero")).toEqual(HERO);
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });

  it("keeps the hero home after a drag that stays in the home radius", () => {
    const { drag, view, state, layer, grab, at, rest } = pressHero();
    const near = { x: at.x + NUDGE, y: at.y + NUDGE };
    expect(Math.hypot(NUDGE, NUDGE)).toBeLessThan(
      view.unitsToPixels(HOME_RADIUS),
    );
    drag.start(grab, near);
    expect(drag.target()).toEqual(HERO);
    drag.drop(near);
    expect(state.squareOf("hero")).toEqual(HERO);
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });

  it("aims home again when the pointer comes back to the press point", () => {
    const { drag, view, state, grab, at, over, turn, aim } = pressHero();
    drag.start(grab, at);
    drag.move(over(FREE));
    expect(drag.target()).toEqual(FREE);
    drag.move(at);
    expect(drag.target()).toEqual(HERO);
    // The radius follows the grab point when the view turns.
    drag.move(over(FREE));
    turn();
    const centre = screenOf(view, grab.world);
    const radius = view.unitsToPixels(HOME_RADIUS);
    // The old press point is now out of the radius of the turned grab point,
    // so it aims at the top under the pointer.
    expect(Math.hypot(at.x - centre.x, at.y - centre.y)).toBeGreaterThan(
      radius,
    );
    const under = pickSquare(BOARD, aim(at, grab.lift), { tops: true });
    expect(under).not.toEqual(HERO);
    drag.move(at);
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(under);
    // A pointer at the turned grab point aims home.
    drag.move(centre);
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(HERO);
    drag.drop(centre);
    expect(state.squareOf("hero")).toEqual(HERO);
  });

  it("aims at the top of the taller column in front out of the home radius", () => {
    const { drag, view, grab, at, aim } = pressHero();
    // The top of [2, 2], two levels higher and diagonally in front, covers all
    // of the hero's top on the screen.
    const DIAGONAL: Square = { x: 2, z: 2 };
    expect(pickSquare(BOARD, aim(at, grab.lift), { tops: true })).toEqual(
      DIAGONAL,
    );
    const out = { x: at.x + view.unitsToPixels(0.6), y: at.y };
    drag.start(grab, at);
    expect(drag.target()).toEqual(HERO);
    drag.move(out);
    expect(drag.target()).toEqual(DIAGONAL);
  });

  it("follows the zoom: the radius stays on the grab point, not on the press pixel", () => {
    const { drag, view, grab, at, aim } = pressHero();
    const pointer = { x: at.x + view.unitsToPixels(0.6), y: at.y };
    drag.start(grab, pointer);
    expect(drag.target()).not.toEqual(HERO);
    // A zoom at the pointer moves the grab point away from it: at 1.5 times
    // the zoom, it is 0.9 of the old units (0.6 of the new units) away, and
    // the radius is 0.5 of the new units. The pointer is only 0.4 of the new
    // units from the old press pixel, so a radius on that pixel would hold it.
    view.zoomAt(1.5, pointer.x, pointer.y);
    expect(view.camera.zoom).toBe(1.5);
    const centre = screenOf(view, grab.world);
    const radius = view.unitsToPixels(HOME_RADIUS);
    expect(
      Math.hypot(pointer.x - centre.x, pointer.y - centre.y),
    ).toBeGreaterThan(radius);
    expect(Math.hypot(pointer.x - at.x, pointer.y - at.y)).toBeLessThan(radius);
    const under = pickSquare(BOARD, aim(pointer, grab.lift), { tops: true });
    expect(under).not.toEqual(HERO);
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(under);
    // A pointer within the radius of the moved grab point aims home.
    const near = { x: centre.x + radius / 2, y: centre.y };
    drag.move(near);
    expect(drag.target()).toEqual(HERO);
  });

  it("grabs other sprites while one settles, but not the settling one", () => {
    const { drag, view, layer, screen, grab, at, over } = pressHero();
    /** A point on the middle of a sprite as it stands now. */
    const onSprite = (id: string): Point => {
      const sprite = layer.get(id);
      if (!sprite) throw new Error(`No sprite "${id}".`);
      const middle = sprite.mesh.position.clone();
      middle.y += sprite.height / 2;
      return screen(middle);
    };
    expect(drag.busy()).toBe(false);
    drag.start(grab, at);
    expect(drag.busy()).toBe(true);
    const before = performance.now();
    drag.drop(over(FREE));
    const after = performance.now();
    expect(drag.busy()).toBe(true);
    expect(drag.grab(onSprite("hero"))).toBeNull();
    const rat = drag.grab(onSprite("rat"));
    expect(rat?.id).toBe("rat");
    // The settle started between `before` and `after`.
    expect(drag.frame(before + SETTLE_MS / 2, view.azimuth)).toBe(true);
    expect(drag.grab(onSprite("hero"))).toBeNull();
    // A drag of the rat leaves the hero's settle to end by itself.
    if (rat) drag.start(rat, onSprite("rat"));
    expect(drag.frame(after + SETTLE_MS, view.azimuth)).toBe(false);
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, FREE));
    drag.cancel();
    drag.frame(Infinity, view.azimuth);
    expect(drag.busy()).toBe(false);
    expect(drag.grab(onSprite("hero"))?.id).toBe("hero");
  });

  it("aims again on the next frame after a turn", () => {
    const { drag, view, grab, at, over, turn, aim } = pressHero();
    drag.start(grab, at);
    const pointer = over(FREE);
    drag.move(pointer);
    expect(drag.target()).toEqual(FREE);
    turn();
    // The board turned under the pointer, which did not move.
    const now = pickSquare(BOARD, aim(pointer, grab.lift), { tops: true });
    expect(now).not.toEqual(FREE);
    expect(drag.target()).toEqual(FREE);
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(now);
  });
});

describe("SpriteDrag save", () => {
  /** Lets each promise that waits end. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** The hero on the stage, with a save that ends when the test says. */
  function pressHeroWithSave() {
    const calls: [string, Square][] = [];
    let finish: (saved: boolean) => void = () => {};
    const parts = pressHeroStage((id, to) => {
      calls.push([id, to]);
      return new Promise<boolean>((resolve) => (finish = resolve));
    });
    return { ...parts, calls, finish: (saved: boolean) => finish(saved) };
  }

  /** The same stage and press as the SpriteDrag tests, with `save`. */
  function pressHeroStage(save: Parameters<typeof stage>[2]) {
    const parts = stage(
      BOARD,
      [
        { spec: spec("hero", HERO), voxels: solid(16, 32) },
        { spec: spec("rat", RAT), voxels: solid(16, 8) },
      ],
      save,
    );
    const foot = standPoint(BOARD, HERO);
    const at = parts.screen(foot.clone().setY(foot.y + 1));
    const grab = parts.drag.grab(at);
    if (grab?.id !== "hero") throw new Error("The press missed the hero.");
    const over = (square: Square): Point => {
      const to = parts.screen(standPoint(BOARD, square));
      const from = parts.screen(foot);
      return { x: to.x + at.x - from.x, y: to.y + at.y - from.y };
    };
    /** A point on the middle of the hero as it stands now. */
    const onHero = (): Point => {
      const hero = parts.layer.get("hero");
      if (!hero) throw new Error("No hero.");
      return parts.screen(
        hero.mesh.position.clone().setY(hero.mesh.position.y + hero.height / 2),
      );
    };
    return { ...parts, at, grab, over, onHero };
  }

  it("saves a move to another square and holds the start square until the save ends", async () => {
    const { drag, state, grab, at, over, rest, calls, finish, onHero } =
      pressHeroWithSave();
    drag.start(grab, at);
    drag.drop(over(FREE));
    expect(calls).toEqual([["hero", FREE]]);
    // The sprite stands on its new square at once.
    expect(state.squareOf("hero")).toEqual(FREE);
    rest();
    expect(drag.busy()).toBe(true);
    // No other sprite can take the start square, and the hero cannot be taken.
    expect(state.canMove("rat", HERO)).toBe(false);
    expect(drag.grab(onHero())).toBeNull();

    finish(true);
    await flush();
    expect(drag.busy()).toBe(false);
    expect(state.squareOf("hero")).toEqual(FREE);
    expect(state.canMove("rat", HERO)).toBe(true);
    expect(drag.grab(onHero())?.id).toBe("hero");
  });

  it("puts the sprite back on its start square when the save fails", async () => {
    const { drag, state, layer, grab, at, over, rest, finish } =
      pressHeroWithSave();
    drag.start(grab, at);
    drag.drop(over(FREE));
    rest();
    finish(false);
    await flush();
    expect(state.squareOf("hero")).toEqual(HERO);
    expect(drag.busy()).toBe(true);
    rest();
    expect(drag.busy()).toBe(false);
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });

  it("puts the sprite back when the save throws", async () => {
    const { drag, state, grab, at, over, rest } = pressHeroStage(() =>
      Promise.reject(new Error("offline")),
    );
    drag.start(grab, at);
    drag.drop(over(FREE));
    await flush();
    rest();
    expect(state.squareOf("hero")).toEqual(HERO);
  });

  it("saves nothing for a drop on its own square, an occupied square or a cancel", () => {
    const { drag, grab, at, over, rest, calls } = pressHeroWithSave();
    drag.start(grab, at);
    drag.drop(over(RAT));
    rest();
    drag.start(grab, at);
    drag.drop(at);
    rest();
    drag.start(grab, at);
    drag.move(over(FREE));
    drag.cancel();
    rest();
    expect(calls).toEqual([]);
    expect(drag.busy()).toBe(false);
  });

  it("puts each sprite on its square of a new layout", () => {
    const { drag, state, layer, grab, at, over } = pressHeroStage(undefined);
    drag.start(grab, at);
    drag.move(over(FREE));
    // A drag that runs ends first.
    drag.relayout({ hero: [3, 3], rat: [1, 1] });
    expect(drag.target()).toBeNull();
    expect(drag.busy()).toBe(false);
    expect(state.squareOf("hero")).toEqual(RAT);
    expect(state.squareOf("rat")).toEqual(HERO);
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(BOARD, RAT));
    expect(layer.get("rat")?.mesh.position).toEqual(standPoint(BOARD, HERO));
  });
});

// Four squares by four, flat. The hero is on [3, 3]. The corner [0, 0] is free,
// and the rat, the bat and the imp on [1, 0], [0, 1] and [1, 1] close it in.
const FLAT: Board = {
  width: 4,
  depth: 4,
  materials: { s: { name: "stone", top: "#888888", side: "#666666" } },
  heights: ["0000", "0000", "0000", "0000"],
  tiles: ["ssss", "ssss", "ssss", "ssss"],
};
const CORNER: Square = { x: 0, z: 0 };

describe("SpriteDrag route", () => {
  /** The stage on `FLAT` and a press on the middle of the hero. */
  function pressHero() {
    const parts = stage(FLAT, [
      { spec: spec("hero", { x: 3, z: 3 }), voxels: solid(16, 32) },
      { spec: spec("rat", { x: 1, z: 0 }), voxels: solid(16, 8) },
      { spec: spec("bat", { x: 0, z: 1 }), voxels: solid(16, 8) },
      { spec: spec("imp", { x: 1, z: 1 }), voxels: solid(16, 8) },
    ]);
    const foot = standPoint(FLAT, { x: 3, z: 3 });
    const at = parts.screen(foot.clone().setY(foot.y + 1));
    const grab = parts.drag.grab(at);
    if (grab?.id !== "hero") throw new Error("The press missed the hero.");
    return {
      ...parts,
      at,
      grab,
      /** The pointer for which the hero aims at the center of `square`. */
      over(square: Square): Point {
        const to = parts.screen(standPoint(FLAT, square));
        const from = parts.screen(foot);
        return { x: to.x + at.x - from.x, y: to.y + at.y - from.y };
      },
    };
  }

  it("shows the route to a free square and its feet, and takes them away at the end", () => {
    const { drag, path, label, grab, at, over } = pressHero();
    drag.start(grab, at);
    // At the start square, the path line and the label show nothing.
    expect(drag.route()).toBeNull();
    expect(path.mesh.visible).toBe(false);
    expect(label.text).toBeNull();
    const target = over({ x: 3, z: 0 });
    drag.move(target);
    expect(drag.route()).toEqual({
      squares: [
        { x: 3, z: 3 },
        { x: 3, z: 2 },
        { x: 3, z: 1 },
        { x: 3, z: 0 },
      ],
      feet: 15,
    });
    expect(path.mesh.visible).toBe(true);
    expect(label.text).toBe("15 ft");

    // A move that keeps the target only moves the label.
    const calls = label.calls.length;
    const geometry = path.mesh.geometry;
    drag.move({ x: target.x + 1, y: target.y });
    expect(label.calls.slice(calls)).toEqual(["move"]);
    expect(path.mesh.geometry).toBe(geometry);

    // Off the board and back: the same route keeps its geometry.
    drag.move({ x: -W, y: -H });
    expect(path.mesh.visible).toBe(false);
    expect(label.text).toBeNull();
    drag.move(target);
    expect(path.mesh.visible).toBe(true);
    expect(path.mesh.geometry).toBe(geometry);

    drag.cancel();
    expect(path.mesh.visible).toBe(false);
    expect(label.text).toBeNull();
    expect(drag.route()).toBeNull();
  });

  it("shows no path to a free square that sprites close in, and a drop there still moves the sprite", () => {
    const { drag, state, layer, path, label, highlight, grab, at, over, rest } =
      pressHero();
    drag.start(grab, at);
    drag.move(over(CORNER));
    expect(drag.target()).toEqual(CORNER);
    expect(state.canMove("hero", CORNER)).toBe(true);
    expect(drag.route()).toBe("none");
    expect(path.mesh.visible).toBe(false);
    expect(label.text).toBe("No path");
    // The square glows free, and the hero stands over it.
    expect(highlight.mesh.visible).toBe(true);
    drag.drop(over(CORNER));
    expect(label.text).toBeNull();
    expect(state.squareOf("hero")).toEqual(CORNER);
    rest();
    expect(layer.get("hero")?.mesh.position).toEqual(standPoint(FLAT, CORNER));
  });

  it("works out the route again for the new target after a turn moves the target", () => {
    const { drag, view, label, grab, at, over, turn, aim } = pressHero();
    drag.start(grab, at);
    const pointer = over({ x: 2, z: 3 });
    drag.move(pointer);
    const before = drag.route();
    expect(before).toMatchObject({ feet: 5 });
    turn();
    // The board turned under the pointer, which did not move.
    const now = pickSquare(FLAT, aim(pointer, grab.lift), { tops: true });
    expect(now).not.toBeNull();
    expect(now).not.toEqual({ x: 2, z: 3 });
    expect(now).not.toEqual({ x: 3, z: 3 });
    const calls = label.calls.length;
    drag.frame(0, view.azimuth);
    expect(drag.target()).toEqual(now);
    const route = drag.route();
    if (!isRoute(route)) throw new Error("No route for the target.");
    expect(route).not.toEqual(before);
    expect(route.squares[0]).toEqual({ x: 3, z: 3 });
    expect(route.squares.at(-1)).toEqual(now);
    // The frame worked out the route once, and the label shows its feet.
    expect(label.calls.slice(calls)).toEqual([`${route.feet} ft`]);
  });
});

describe("SpriteDrag on the demo board", () => {
  it("aims each sprite home for a nudge in the radius, at each turn", () => {
    const result = parseScene(
      readFileSync(
        new URL("../../public/scenes/demo.json", import.meta.url),
        "utf8",
      ),
    );
    if (!result.ok) throw new Error(result.problems.join("\n"));
    const { board, sprites } = result.scene;
    const pixels = spritePixels();
    const parts = stage(
      board,
      sprites.map((s) => {
        const { width, height, rgba } = pixels[s.id];
        return {
          spec: s,
          voxels: { width, voxels: voxelsFromPixels(width, height, rgba) },
        };
      }),
    );
    const { drag, view, layer, state, screen, aim, turn, rest } = parts;
    // The nudge below is in the home radius of the press.
    expect(NUDGE).toBeLessThan(view.unitsToPixels(HOME_RADIUS));
    let presses = 0;
    /** Presses where a taller column in front hides the sprite's foot. */
    let hidden = 0;
    /** Presses where the first top under the dropped grab point is another column's. */
    let covered = 0;
    const misses: string[] = [];
    for (let turns = 0; turns < 4; turns++) {
      for (const { id } of sprites) {
        const sprite = layer.get(id);
        const from = state.squareOf(id);
        if (!sprite || !from) throw new Error(`No sprite "${id}".`);
        // The first height of the sprite where a press takes it: a
        // transparent pixel, another sprite or a column can be in front.
        for (const part of [0.5, 0.4, 0.6, 0.2, 0.8]) {
          const point = sprite.mesh.position.clone();
          point.y += sprite.height * part;
          const at = screen(point);
          const grab = drag.grab(at);
          if (grab?.id !== id) continue;
          presses++;
          if (!same(pickSquare(board, aim(at, grab.lift)), from)) hidden++;
          const top = pickSquare(board, aim(at, grab.lift), { tops: true });
          if (!same(top, from)) covered++;
          drag.start(grab, { x: at.x + NUDGE, y: at.y });
          drag.frame(0, view.azimuth);
          const target = drag.target();
          if (!same(target, from)) {
            misses.push(`${id}, turn ${turns}: [${target?.x}, ${target?.z}]`);
          }
          drag.cancel();
          rest();
          break;
        }
      }
      turn();
    }
    expect(misses).toEqual([]);
    expect(presses).toBe(sprites.length * 4);
    // The orc's foot, at least, is behind a taller column at turn 0.
    expect(hidden).toBeGreaterThan(0);
    // The first top alone is not enough: the home radius is needed.
    expect(covered).toBeGreaterThan(0);
  });
});
