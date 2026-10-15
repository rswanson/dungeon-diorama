import { expect, test as base, type Page } from "@playwright/test";
import { MAX_PIXEL_RATIO } from "../src/client/pixel-ratio.js";
import type { Diorama } from "../src/shared/diorama.js";

// Each test fails when the page threw an error, also after its last step.
export const test = base.extend<{ pageErrors: Error[] }>({
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
export function hook<K extends keyof Diorama>(
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

/** Waits until the board and each sprite show. */
export async function ready(page: Page): Promise<void> {
  // Each sprite stands on the board only when WebGL works.
  await expect
    .poll(() => hook(page, "ready"), {
      message: "the board and its sprites show",
    })
    .toBe(true);
}

/** The Dice button, which opens and closes the dice sidebar. */
export function diceToggle(page: Page) {
  return page.getByRole("button", { name: "Dice" });
}

/**
 * Turns the mouse wheel by `deltaY` with the pointer at `at` (a negative
 * `deltaY` zooms in), and waits until the screen point of the probe square
 * `[x, z]` moves, which is when the zoom shows.
 */
export async function zoomAt(
  page: Page,
  at: { x: number; y: number },
  deltaY: number,
  probe: [number, number],
): Promise<void> {
  const before = await hook(page, "squareScreen", ...probe);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, deltaY);
  await expect
    .poll(() => hook(page, "squareScreen", ...probe))
    .not.toEqual(before);
}

/**
 * The box of the board's canvas on the page, and the width in CSS pixels of
 * the view that the page drew last. Each changes when the board area changes.
 */
export function boardArea(page: Page) {
  return page.locator("#scene").evaluate((canvas, maxRatio) => {
    const { x, y, width, height } = canvas.getBoundingClientRect();
    // The renderer sets the width attribute: the drawn width times the pixel
    // ratio. The renderer caps the ratio at `MAX_PIXEL_RATIO`.
    const { devicePixelRatio } = globalThis as unknown as {
      devicePixelRatio: number;
    };
    const drawn =
      Number(canvas.getAttribute("width")) /
      Math.min(devicePixelRatio, maxRatio);
    return { x, y, width, height, drawn };
  }, MAX_PIXEL_RATIO);
}
