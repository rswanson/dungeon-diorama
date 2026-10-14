import { readFileSync } from "node:fs";
import { expect, test as base, type Page } from "@playwright/test";
import type { Diorama } from "../src/shared/diorama.js";
import { findPath } from "../src/shared/path.js";
import { parseScene } from "../src/shared/scene.js";
import { CLICK_SLOP } from "../src/client/press.js";

type Square = [number, number];

/** The fighter's square in the demo scene file, a free square, and the goblin's square. */
const FIGHTER: Square = [7, 6];
const FREE: Square = [5, 6];
const GOBLIN: Square = [12, 4];
/** The wizard's square, and a free square across the board on a diagonal from it, behind the fighter. */
const WIZARD: Square = [3, 2];
const ACROSS: Square = [8, 7];
/** A free square on the diagonal between them. */
const MIDWAY: Square = [5, 4];

/** The nudge after the press: just past the click slop, so the press becomes a drag. */
const NUDGE_PX = CLICK_SLOP + 2;
const NUDGE_STEPS = 2;
/** The mouse moves to a square in this many steps, so the drag sees the squares on the way. */
const MOVE_STEPS = 12;

// Each test fails when the page threw an error, also after the drag.
const test = base.extend<{ pageErrors: Error[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

type Args<K extends keyof Diorama> = Diorama[K] extends (
  ...args: infer A
) => unknown
  ? A
  : [];
type Result<K extends keyof Diorama> = Diorama[K] extends (
  ...args: never[]
) => infer R
  ? R
  : Diorama[K];

/**
 * Reads `name` from the page's `window.diorama` (src/client/hook.ts), and
 * calls it with `args` when it is a method. It gives null before the page
 * made the hook.
 */
function hook<K extends keyof Diorama>(
  page: Page,
  name: K,
  ...args: Args<K>
): Promise<Result<K> | null> {
  return page.evaluate(
    ([name, args]) => {
      const diorama = (globalThis as { diorama?: Diorama }).diorama;
      const value: unknown = diorama?.[name];
      return typeof value === "function"
        ? value.apply(diorama, args)
        : (value ?? null);
    },
    [name, args] as const,
  ) as Promise<Result<K> | null>;
}

/**
 * Presses on the middle of a sprite. It gives back a function that moves the
 * mouse to where the pointer must be for the sprite to aim at the center of
 * a square. The drag aims the grab point dropped to the height of the foot,
 * so the pointer stays above the square's center by the same distance on the
 * screen as the grab point above the foot at the press.
 */
async function grab(
  page: Page,
  id: string,
): Promise<{
  /** A few pixels from the press: past the click slop, near the grab point. */
  nudge(): Promise<void>;
  moveTo(square: Square): Promise<void>;
}> {
  const start = await hook(page, "spriteSquare", id);
  const body = await hook(page, "spriteScreen", id);
  const foot = start && (await hook(page, "squareScreen", ...start));
  if (!body || !foot) throw new Error(`No point on the screen for "${id}".`);
  await page.mouse.move(body.x, body.y);
  await page.mouse.down();
  return {
    async nudge() {
      await page.mouse.move(body.x + NUDGE_PX, body.y, {
        steps: NUDGE_STEPS,
      });
    },
    async moveTo(square) {
      const to = await hook(page, "squareScreen", ...square);
      if (!to)
        throw new Error(`Square [${square.join(", ")}] is off the board.`);
      await page.mouse.move(to.x + body.x - foot.x, to.y + body.y - foot.y, {
        steps: MOVE_STEPS,
      });
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Each sprite stands on the board only when WebGL works.
  await expect
    .poll(() => hook(page, "ready"), {
      message: "the board and its sprites show",
    })
    .toBe(true);
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
});

test("a drag puts the fighter on a free square", async ({ page }) => {
  const held = await grab(page, "fighter");
  // Just past the slop, the pointer is still at the grab point: the fighter
  // aims at its own square, not at the square behind its body.
  await held.nudge();
  expect(await hook(page, "dragTarget")).toEqual(FIGHTER);
  expect(await hook(page, "spriteSquare", "fighter")).toBeNull();

  await held.moveTo(FREE);
  expect(await hook(page, "dragTarget")).toEqual(FREE);
  await page.mouse.up();
  await expect.poll(() => hook(page, "spriteSquare", "fighter")).toEqual(FREE);
  expect(await hook(page, "dragTarget")).toBeNull();
});

test("a drop on the goblin's square puts the fighter back", async ({
  page,
}) => {
  const held = await grab(page, "fighter");
  await held.moveTo(GOBLIN);
  expect(await hook(page, "dragTarget")).toEqual(GOBLIN);
  // The drop on an occupied square does not move the fighter: no route shows.
  expect(await hook(page, "dragPath")).toBeNull();
  // During the drag the sprite is lifted, so it stands on no square.
  expect(await hook(page, "spriteSquare", "fighter")).toBeNull();
  await page.mouse.up();
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
  expect(await hook(page, "spriteSquare", "goblin")).toEqual(GOBLIN);
});

test("a drop off the board puts the fighter back", async ({ page }) => {
  const held = await grab(page, "fighter");
  await held.nudge();
  expect(await hook(page, "dragTarget")).toEqual(FIGHTER);
  // The top left corner of the window: the board is not under it.
  await page.mouse.move(1, 1, { steps: MOVE_STEPS });
  // No square glows.
  expect(await hook(page, "dragTarget")).toBeNull();
  await page.mouse.up();
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
});

test("Esc during a drag puts the fighter back", async ({ page }) => {
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  expect(await hook(page, "dragTarget")).toEqual(FREE);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
  expect(await hook(page, "dragPath")).toBeNull();
  await expect(page.locator(".path-label")).toBeHidden();
  // The release after the cancel moves nothing.
  await page.mouse.up();
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
});

test("a drag shows the route and its feet until the drop", async ({ page }) => {
  // The route the demo scene file gives: around the other sprites.
  const result = parseScene(
    readFileSync(
      new URL("../public/scenes/demo.json", import.meta.url),
      "utf8",
    ),
  );
  if (!result.ok) throw new Error(result.problems.join("\n"));
  const { board, sprites } = result.scene;
  const others = new Set(
    sprites.filter((s) => s.id !== "wizard").map((s) => s.at.join(",")),
  );
  /** The route the demo scene file gives from the wizard's square to `to`. */
  const routeTo = (to: Square) => {
    const route = findPath(
      { ...board, blocked: (x, z) => others.has(`${x},${z}`) },
      { x: WIZARD[0], z: WIZARD[1] },
      { x: to[0], z: to[1] },
    );
    if (!route) throw new Error("The demo scene has no route to the square.");
    return route;
  };
  const route = routeTo(ACROSS);

  expect(await hook(page, "spriteSquare", "wizard")).toEqual(WIZARD);
  const held = await grab(page, "wizard");
  const label = page.locator(".path-label");
  // On the way, on a free square between the two: the route is to that square.
  const halfway = routeTo(MIDWAY);
  await held.moveTo(MIDWAY);
  expect(await hook(page, "dragTarget")).toEqual(MIDWAY);
  expect(await hook(page, "dragPath")).toEqual({
    squares: halfway.squares.map(({ x, z }) => [x, z]),
    feet: halfway.feet,
  });
  await expect(label).toHaveText(`${halfway.feet} ft`);

  await held.moveTo(ACROSS);
  expect(await hook(page, "dragTarget")).toEqual(ACROSS);
  // Each square from the wizard's square to the target, both in it.
  expect(await hook(page, "dragPath")).toEqual({
    squares: route.squares.map(({ x, z }) => [x, z]),
    feet: route.feet,
  });
  await expect(label).toHaveText(`${route.feet} ft`);

  await page.mouse.up();
  await expect.poll(() => hook(page, "spriteSquare", "wizard")).toEqual(ACROSS);
  expect(await hook(page, "dragPath")).toBeNull();
  await expect(label).toBeHidden();
});
