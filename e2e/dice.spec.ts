import { expect, test as base, type Page, type Route } from "@playwright/test";
import type { Diorama } from "../src/shared/diorama.js";

// Each test fails when the page threw an error.
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

const ROLLS = "**/api/scenes/*/rolls";

/** The dice input, its log entries and its error line. */
function sidebar(page: Page) {
  return {
    toggle: page.getByRole("button", { name: "Dice" }),
    panel: page.locator(".dice-panel"),
    input: page.getByRole("textbox", { name: "Dice roll" }),
    entries: page.locator(".dice-log li"),
    error: page.locator(".dice-error"),
  };
}

/** The point on the screen of square [x, z], from `window.diorama`. */
function squareScreen(page: Page, x: number, z: number) {
  return page.evaluate(
    ([x, z]) =>
      (globalThis as { diorama?: Diorama }).diorama?.squareScreen(x, z) ?? null,
    [x, z],
  );
}

// Each test has a browser context of its own, so it is a new visitor.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as { diorama?: Diorama }).diorama?.ready),
    )
    .toBe(true);
});

test("/roll 2d6+1 adds an entry with each die, the modifier and the total", async ({
  page,
}) => {
  const { input, entries, error } = sidebar(page);
  await input.fill("/roll 2d6+1");
  await input.press("Enter");

  await expect(entries).toHaveCount(1);
  const entry = entries.first();
  await expect(entry.locator(".dice-dice")).toHaveText("2d6+1");
  await expect(entry.locator("time")).toHaveText(/^\d\d:\d\d$/);
  const line = await entry.locator(".dice-line").textContent();
  const match = /^\(([1-6]), ([1-6])\) \+ 1 = (\d+)$/.exec(line ?? "");
  expect(match, String(line)).not.toBeNull();
  const [a, b, total] = match!.slice(1).map(Number);
  expect(total).toBe(a + b + 1);
  await expect(entry.locator("strong")).toHaveText(String(total));
  await expect(input).toHaveValue("");
  await expect(error).toBeEmpty();

  // Each new entry goes at the bottom, and the log scrolls to it.
  for (let n = 2; n <= 15; n++) {
    await input.fill(`/roll d20-${n}`);
    await input.press("Enter");
    await expect(entries).toHaveCount(n);
  }
  await expect(entries.last().locator(".dice-dice")).toHaveText("1d20-15");
  const log = page.locator(".dice-log");
  const { top, height, client } = await log.evaluate((el) => ({
    top: el.scrollTop,
    height: el.scrollHeight,
    client: el.clientHeight,
  }));
  expect(height).toBeGreaterThan(client);
  expect(top + client).toBeGreaterThanOrEqual(height - 1);
});

test("an error shows under the input, keeps the text and logs nothing", async ({
  page,
}) => {
  const { input, entries, error } = sidebar(page);
  const sends: Route[] = [];
  await page.route(ROLLS, (route) => {
    sends.push(route);
  });

  // The parser's error shows at once, with no request.
  await input.fill("/roll 2d0");
  await input.press("Enter");
  await expect(error).toHaveText(
    "`2d0` is not valid dice. Use NdS±M, for example /roll 1d20+5.",
  );
  // Empty input sends nothing.
  await input.fill("  ");
  await input.press("Enter");
  expect(sends).toHaveLength(0);

  // A 400 shows the server's message.
  await input.fill("/roll 1d6");
  await input.press("Enter");
  await expect.poll(() => sends.length).toBe(1);
  await sends[0].fulfill({ status: 400, json: { error: "From the server." } });
  await expect(error).toHaveText("From the server.");

  // During a send, a second Enter does nothing. A 5xx shows its own error.
  await input.press("Enter");
  await expect.poll(() => sends.length).toBe(2);
  await expect(input).toHaveJSProperty("readOnly", true);
  await input.press("Enter");
  await sends[1].fulfill({
    status: 500,
    json: { error: "The server failed." },
  });
  await expect(error).toHaveText("Roll not saved. Try again.");
  expect(sends).toHaveLength(2);

  // No network gives the same error. A send clears the error line first.
  await input.press("Enter");
  await expect.poll(() => sends.length).toBe(3);
  await expect(error).toBeEmpty();
  await sends[2].abort("internetdisconnected");
  await expect(error).toHaveText("Roll not saved. Try again.");

  await expect(input).toHaveValue("/roll 1d6");
  await expect(entries).toHaveCount(0);
});

test("the Dice button opens and closes the sidebar, which does not cover the turn buttons", async ({
  page,
}) => {
  const { toggle, panel } = sidebar(page);
  const turn = page.getByRole("button", { name: "Turn right" });
  // Open at the start on a window 768px or wider.
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  const open = await page.locator(".dice").boundingBox();
  expect(open).toMatchObject({ x: 1280 - 320, width: 320 });
  const turnBox = await turn.boundingBox();
  expect(turnBox!.x + turnBox!.width).toBeLessThanOrEqual(open!.x);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect
    .poll(async () => (await turn.boundingBox())!.x)
    .toBeGreaterThan(open!.x);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  // A later resize does not close it. On a narrower window, it is closed at the start.
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await toggle.click();
  expect(await page.locator(".dice").boundingBox()).toMatchObject({
    width: 320,
  });
  await expect(turn).toBeVisible();

  // On a window too narrow for the turn buttons to fit left of the open sidebar,
  // the sidebar hides them. They show again when it closes.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(turn).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(turn).toBeVisible();
  const narrow = await turn.boundingBox();
  expect(narrow!.x).toBeGreaterThanOrEqual(0);
  expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(375);
});

test("a press on the sidebar does not pan, and Q, E and Esc in the input are text", async ({
  page,
}) => {
  const { input } = sidebar(page);
  const before = await squareScreen(page, 0, 0);

  // A right-button drag on the sidebar does not pan the board.
  const drag = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...from);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(...to, { steps: 5 });
    await page.mouse.up({ button: "right" });
  };
  await drag([1100, 300], [1000, 360]);
  expect(await squareScreen(page, 0, 0)).toEqual(before);
  // The same drag on the board pans it.
  await drag([300, 600], [200, 660]);
  expect(await squareScreen(page, 0, 0)).not.toEqual(before);

  // Q and E in the input are text: the camera does not turn. A turn lasts about
  // 250 ms, so wait longer than that before the check.
  const panned = await squareScreen(page, 0, 0);
  await input.click();
  await page.keyboard.type("qQ eE");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("qQ eE");
  await page.waitForTimeout(500);
  expect(await squareScreen(page, 0, 0)).toEqual(panned);
  // Outside the input, Q turns the camera as before. E turns it back.
  await input.blur();
  await page.keyboard.press("q");
  await expect.poll(async () => squareScreen(page, 0, 0)).not.toEqual(panned);
  await page.keyboard.press("e");
  await expect.poll(async () => squareScreen(page, 0, 0)).toEqual(panned);

  // Esc in the input does not cancel a drag.
  const fighter = await page.evaluate(() =>
    (globalThis as { diorama?: Diorama }).diorama?.spriteScreen("fighter"),
  );
  await page.mouse.move(fighter!.x, fighter!.y);
  await page.mouse.down();
  await page.mouse.move(fighter!.x + 40, fighter!.y, { steps: 5 });
  const dragTarget = () =>
    page.evaluate(() =>
      (globalThis as { diorama?: Diorama }).diorama?.dragTarget(),
    );
  expect(await dragTarget()).not.toBeNull();
  await input.focus();
  await page.keyboard.press("Escape");
  expect(await dragTarget()).not.toBeNull();
  await page.mouse.up();
});
