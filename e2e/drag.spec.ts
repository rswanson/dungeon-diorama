import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { findPath } from "../src/shared/path.js";
import { parseScene, squareKey, type Scene } from "../src/shared/scene.js";
import { CLICK_SLOP } from "../src/client/press.js";
import { boardArea, hook, ready, test } from "./fixtures.js";

type Square = [number, number];

/** The demo scene file. */
function demoScene(): Scene {
  const result = parseScene(
    readFileSync(
      new URL("../public/scenes/demo.json", import.meta.url),
      "utf8",
    ),
  );
  if (!result.ok) throw new Error(result.problems.join("\n"));
  return result.scene;
}

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
  /** Moves the mouse for the square and gives back where the pointer is. */
  moveTo(square: Square): Promise<{ x: number; y: number }>;
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
      const pointer = { x: to.x + body.x - foot.x, y: to.y + body.y - foot.y };
      await page.mouse.move(pointer.x, pointer.y, { steps: MOVE_STEPS });
      return pointer;
    },
  };
}

/** The Dice button, which opens and closes the dice sidebar. */
const diceToggle = (page: Page) => page.getByRole("button", { name: "Dice" });

// Each test has a browser context of its own, so it is a new visitor with no
// saved moves: the fighter stands on its square of the scene file. The window
// is 1280px wide, so the dice sidebar is open at the start.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
  await expect(diceToggle(page)).toHaveAttribute("aria-expanded", "true");
});

test("a drag puts the fighter on a free square, and it stays after a reload", async ({
  page,
  browser,
}) => {
  const held = await grab(page, "fighter");
  // Just past the slop, the pointer is still at the grab point: the fighter
  // aims at its own square, not at the square behind its body.
  await held.nudge();
  expect(await hook(page, "dragTarget")).toEqual(FIGHTER);
  expect(await hook(page, "spriteSquare", "fighter")).toBeNull();

  await held.moveTo(FREE);
  expect(await hook(page, "dragTarget")).toEqual(FREE);
  await page.mouse.up();
  // The fighter is at rest on its square only once the move saved.
  await expect.poll(() => hook(page, "spriteSquare", "fighter")).toEqual(FREE);
  expect(await hook(page, "dragTarget")).toBeNull();
  await expect(page.locator(".notice")).toBeEmpty();

  await page.reload();
  await ready(page);
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FREE);

  // Another visitor sees the scene file layout.
  const other = await browser.newContext();
  try {
    const stranger = await other.newPage();
    await stranger.goto("/");
    await ready(stranger);
    expect(await hook(stranger, "spriteSquare", "fighter")).toEqual(FIGHTER);
  } finally {
    await other.close();
  }
});

test("with the sidebar closed, a drag puts the fighter on a free square", async ({
  page,
}) => {
  await diceToggle(page).click();
  // The board fills the window again.
  await expect.poll(async () => (await boardArea(page)).drawn).toBe(1280);
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  expect(await hook(page, "dragTarget")).toEqual(FREE);
  await page.mouse.up();
  await expect.poll(() => hook(page, "spriteSquare", "fighter")).toEqual(FREE);
});

test("a right-drag pan and a wheel zoom keep the square under the pointer", async ({
  page,
}) => {
  const square = async () => (await hook(page, "squareScreen", ...FREE))!;
  const start = await square();
  // Whole pixels, so the pointer events have the same point.
  const from = { x: Math.round(start.x), y: Math.round(start.y) };
  const to = { x: from.x - 60, y: from.y + 40 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up({ button: "right" });
  const panned = await square();
  expect(panned.x).toBeCloseTo(start.x + to.x - from.x, 3);
  expect(panned.y).toBeCloseTo(start.y + to.y - from.y, 3);

  // The zoom keeps the board point under the pointer at the pointer.
  const at = { x: Math.round(panned.x), y: Math.round(panned.y) };
  await page.mouse.move(at.x, at.y);
  const near = (await hook(page, "squareScreen", FREE[0] + 2, FREE[1]))!;
  await page.mouse.wheel(0, -200);
  await expect
    .poll(() => hook(page, "squareScreen", FREE[0] + 2, FREE[1]))
    .not.toEqual(near);
  // The square was less than 0.5px from the pointer, so the zoom moves it less than 1px.
  const zoomed = await square();
  expect(Math.abs(zoomed.x - at.x)).toBeLessThan(1);
  expect(Math.abs(zoomed.y - at.y)).toBeLessThan(1);
});

test("a move that does not save puts the fighter back with a notice", async ({
  page,
}) => {
  await page.route("**/api/scenes/*/sprites/*/position", (route) =>
    route.fulfill({ status: 500, json: { error: "The server failed." } }),
  );
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Move not saved");
  await expect
    .poll(() => hook(page, "spriteSquare", "fighter"))
    .toEqual(FIGHTER);
});

test("a move that the server refuses with 409 puts the fighter back and shows the layout of the 409", async ({
  page,
}) => {
  // Another tab moved the goblin onto the square that the fighter aims at.
  // The 409 gives the layout on the server.
  const positions = {
    ...Object.fromEntries(demoScene().sprites.map((s) => [s.id, s.at])),
    goblin: FREE,
  };
  await page.route("**/api/scenes/*/sprites/*/position", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "Another sprite stands on that square.", positions },
    }),
  );
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Move not saved");
  await expect.poll(() => hook(page, "spriteSquare", "goblin")).toEqual(FREE);
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
});

test("the scene file layout shows when the saved moves do not load", async ({
  page,
}) => {
  await page.route("**/api/scenes/*/positions", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.reload();
  await ready(page);
  await expect(page.getByRole("status")).toHaveText("Saved moves did not load");
  expect(await hook(page, "spriteSquare", "fighter")).toEqual(FIGHTER);
  // A drag still works and saves.
  await page.unrouteAll();
  const held = await grab(page, "fighter");
  await held.moveTo(FREE);
  await page.mouse.up();
  await expect.poll(() => hook(page, "spriteSquare", "fighter")).toEqual(FREE);
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
  const { board, sprites } = demoScene();
  const others = new Set(
    sprites
      .filter((s) => s.id !== "wizard")
      .map(({ at: [x, z] }) => squareKey({ x, z })),
  );
  /** The route the demo scene file gives from the wizard's square to `to`. */
  const routeTo = (to: Square) => {
    const route = findPath(
      { ...board, blocked: (x, z) => others.has(squareKey({ x, z })) },
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
  const nearPointer = async (pointer: { x: number; y: number }) => {
    const box = await label.boundingBox();
    if (!box) throw new Error("The route label has no box.");
    const area = await boardArea(page);
    // The label lies fully inside the board area, left of the open sidebar.
    expect(box.x).toBeGreaterThanOrEqual(area.x);
    expect(box.y).toBeGreaterThanOrEqual(area.y);
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
    // Its nearest edge is within 60 px of the pointer, on each axis.
    const gapX = Math.max(
      box.x - pointer.x,
      pointer.x - (box.x + box.width),
      0,
    );
    const gapY = Math.max(
      box.y - pointer.y,
      pointer.y - (box.y + box.height),
      0,
    );
    expect(gapX).toBeLessThanOrEqual(60);
    expect(gapY).toBeLessThanOrEqual(60);
  };

  const pointerMidway = await held.moveTo(MIDWAY);
  expect(await hook(page, "dragTarget")).toEqual(MIDWAY);
  expect(await hook(page, "dragPath")).toEqual(halfway);
  await expect(label).toHaveText(`${halfway.feet} ft`);
  await nearPointer(pointerMidway);

  const pointerAcross = await held.moveTo(ACROSS);
  expect(await hook(page, "dragTarget")).toEqual(ACROSS);
  // Each square from the wizard's square to the target, both in it.
  expect(await hook(page, "dragPath")).toEqual(route);
  await expect(label).toHaveText(`${route.feet} ft`);
  await nearPointer(pointerAcross);

  await page.mouse.up();
  await expect.poll(() => hook(page, "spriteSquare", "wizard")).toEqual(ACROSS);
  expect(await hook(page, "dragPath")).toBeNull();
  await expect(label).toBeHidden();
});

test("the route label stays inside the board area near its right edge", async ({
  page,
}) => {
  // Zoom in at the left, so a free square lies near the right edge of the
  // board area, which the open sidebar bounds.
  const near: Square = [11, 6];
  const before = (await hook(page, "squareScreen", ...near))!;
  await page.mouse.move(100, 360);
  await page.mouse.wheel(0, -300);
  await expect
    .poll(() => hook(page, "squareScreen", ...near))
    .not.toEqual(before);
  const held = await grab(page, "wizard");
  const pointer = await held.moveTo(near);
  expect(await hook(page, "dragTarget")).toEqual(near);
  const area = await boardArea(page);
  // The pointer is too near the right edge for a label to its right.
  expect(pointer.x).toBeLessThan(area.width);
  expect(pointer.x).toBeGreaterThan(area.width - 100);
  const label = page.locator(".path-label");
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  if (!box) throw new Error("The route label has no box.");
  expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
  await page.mouse.up();
});
