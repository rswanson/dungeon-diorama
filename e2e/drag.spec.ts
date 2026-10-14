import { expect, test, type Page } from "@playwright/test";

// The page puts a small read-only view of the board on `window.diorama`
// (src/client/hook.ts). This file runs in Node, so it names the parts it uses here.
interface Diorama {
  readonly ready: boolean;
  squareScreen(x: number, z: number): { x: number; y: number };
  spriteScreen(id: string): { x: number; y: number } | null;
  spriteSquare(id: string): [number, number] | null;
}
type Hooked = { diorama?: Diorama };

/** The fighter's square in the demo scene file, a free square, and the goblin's square. */
const FIGHTER: [number, number] = [7, 6];
const FREE: [number, number] = [5, 6];
const GOBLIN: [number, number] = [12, 4];

const spriteSquare = (page: Page, id: string) =>
  page.evaluate(
    (id) => (globalThis as Hooked).diorama?.spriteSquare(id) ?? null,
    id,
  );

/**
 * Presses on the middle of a sprite, moves in small steps to the center of a
 * square, and lets go.
 */
async function dragTo(
  page: Page,
  id: string,
  [x, z]: [number, number],
): Promise<void> {
  const from = await page.evaluate(
    (id) => (globalThis as Hooked).diorama?.spriteScreen(id),
    id,
  );
  const to = await page.evaluate(
    ([x, z]) => (globalThis as Hooked).diorama?.squareScreen(x, z),
    [x, z],
  );
  if (!from || !to) throw new Error(`No point on the screen for "${id}".`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  // During the drag the sprite is lifted, so it stands on no square.
  expect(await spriteSquare(page, id)).toBeNull();
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/");
  // Each sprite stands on the board only when WebGL works.
  await expect
    .poll(
      () => page.evaluate(() => (globalThis as Hooked).diorama?.ready === true),
      { message: "the board and its sprites show" },
    )
    .toBe(true);
  expect(errors).toEqual([]);
  expect(await spriteSquare(page, "fighter")).toEqual(FIGHTER);
});

test("a drag puts the fighter on a free square", async ({ page }) => {
  await dragTo(page, "fighter", FREE);
  await expect.poll(() => spriteSquare(page, "fighter")).toEqual(FREE);
});

test("a drop on the goblin's square puts the fighter back", async ({
  page,
}) => {
  await dragTo(page, "fighter", GOBLIN);
  await expect.poll(() => spriteSquare(page, "fighter")).toEqual(FIGHTER);
  expect(await spriteSquare(page, "goblin")).toEqual(GOBLIN);
});
