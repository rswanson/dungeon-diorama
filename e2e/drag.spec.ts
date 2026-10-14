import { expect, test as base, type Page } from "@playwright/test";
import type { Diorama } from "../src/shared/diorama.js";
import { CLICK_SLOP } from "../src/client/press.js";

type Square = [number, number];

/** The fighter's square in the demo scene file, a free square, and the goblin's square. */
const FIGHTER: Square = [7, 6];
const FREE: Square = [5, 6];
const GOBLIN: Square = [12, 4];

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
  // During the drag the sprite is lifted, so it stands on no square.
  expect(await hook(page, "spriteSquare", "fighter")).toBeNull();
  await page.mouse.up();
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
  expect(await hook(page, "spriteSquare", "goblin")).toEqual(GOBLIN);
});

test("Esc during a drag puts the fighter back", async ({ page }) => {
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  expect(await hook(page, "dragTarget")).toEqual(FREE);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
  // The release after the cancel moves nothing.
  await page.mouse.up();
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
});
