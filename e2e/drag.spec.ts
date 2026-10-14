import { expect, test as base, type Page } from "@playwright/test";

// The page puts a small read-only view of the board on `window.diorama`
// (src/client/hook.ts). This file runs in Node, so it names the parts it uses here.
interface Diorama {
  readonly ready: boolean;
  squareScreen(x: number, z: number): { x: number; y: number } | null;
  spriteScreen(id: string): { x: number; y: number } | null;
  spriteSquare(id: string): [number, number] | null;
  dragTarget(): [number, number] | null;
}
type Hooked = { diorama?: Diorama };
type Square = [number, number];

/** The fighter's square in the demo scene file, a free square, and the goblin's square. */
const FIGHTER: Square = [7, 6];
const FREE: Square = [5, 6];
const GOBLIN: Square = [12, 4];

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

const spriteSquare = (page: Page, id: string) =>
  page.evaluate(
    (id) => (globalThis as Hooked).diorama?.spriteSquare(id) ?? null,
    id,
  );

const dragTarget = (page: Page) =>
  page.evaluate(() => (globalThis as Hooked).diorama?.dragTarget() ?? null);

interface Point {
  x: number;
  y: number;
}

/**
 * Presses on the middle of a sprite. It gives back a function that moves the
 * mouse, in small steps, to where the pointer must be for the sprite's foot to
 * stand on the center of a square. The foot is lower than the pointer by the
 * same distance as at the press.
 */
async function grab(
  page: Page,
  id: string,
): Promise<{
  /** A few pixels from the press: past the click slop, near the grab point. */
  nudge(): Promise<void>;
  moveTo(square: Square): Promise<void>;
}> {
  const start = await spriteSquare(page, id);
  const [body, foot] = await page.evaluate(
    ([id, start]) => {
      const diorama = (globalThis as Hooked).diorama;
      return [
        diorama?.spriteScreen(id),
        start && diorama?.squareScreen(start[0], start[1]),
      ];
    },
    [id, start] as const,
  );
  if (!body || !foot) throw new Error(`No point on the screen for "${id}".`);
  await page.mouse.move(body.x, body.y);
  await page.mouse.down();
  return {
    async nudge() {
      await page.mouse.move(body.x + 6, body.y, { steps: 2 });
    },
    async moveTo([x, z]) {
      const to: Point | null = await page.evaluate(
        ([x, z]) => (globalThis as Hooked).diorama?.squareScreen(x, z) ?? null,
        [x, z],
      );
      if (!to) throw new Error(`Square [${x}, ${z}] is off the board.`);
      await page.mouse.move(to.x + body.x - foot.x, to.y + body.y - foot.y, {
        steps: 12,
      });
    },
  };
}

/** Presses on a sprite, moves it over a square, and lets go. */
async function dragTo(page: Page, id: string, square: Square): Promise<void> {
  const held = await grab(page, id);
  await held.moveTo(square);
  // During the drag the sprite is lifted, so it stands on no square.
  expect(await spriteSquare(page, id)).toBeNull();
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Each sprite stands on the board only when WebGL works.
  await expect
    .poll(
      () => page.evaluate(() => (globalThis as Hooked).diorama?.ready === true),
      { message: "the board and its sprites show" },
    )
    .toBe(true);
  expect(await spriteSquare(page, "fighter")).toEqual(FIGHTER);
});

test("a drag puts the fighter on a free square", async ({ page }) => {
  const held = await grab(page, "fighter");
  // Just past the slop, the pointer is still at the grab point: the fighter
  // aims at its own square, not at the square behind its body.
  await held.nudge();
  expect(await dragTarget(page)).toEqual(FIGHTER);
  expect(await spriteSquare(page, "fighter")).toBeNull();

  await held.moveTo(FREE);
  expect(await dragTarget(page)).toEqual(FREE);
  await page.mouse.up();
  await expect.poll(() => spriteSquare(page, "fighter")).toEqual(FREE);
  expect(await dragTarget(page)).toBeNull();
});

test("a drop on the goblin's square puts the fighter back", async ({
  page,
}) => {
  await dragTo(page, "fighter", GOBLIN);
  await expect.poll(() => spriteSquare(page, "fighter")).toEqual(FIGHTER);
  expect(await spriteSquare(page, "goblin")).toEqual(GOBLIN);
});

test("Esc during a drag puts the fighter back", async ({ page }) => {
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  expect(await dragTarget(page)).toEqual(FREE);
  await page.keyboard.press("Escape");
  await expect.poll(() => spriteSquare(page, "fighter")).toEqual(FIGHTER);
  // The release after the cancel moves nothing.
  await page.mouse.up();
  expect(await spriteSquare(page, "fighter")).toEqual(FIGHTER);
});
