import { expect, type Page, type Route } from "@playwright/test";
import { parseTerm, rollTerm } from "../src/shared/dice.js";
import { hook, ready, test } from "./fixtures.js";

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

/** True when the log shows its newest entry: it scrolls, and it is at the end. */
function scrolledToEnd(page: Page) {
  return page.locator(".dice-log").evaluate((el) => {
    const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    return el.scrollHeight > el.clientHeight && end;
  });
}

// Each test has a browser context of its own, so it is a new visitor.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
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
  expect(await scrolledToEnd(page)).toBe(true);
});

test("a note shows its text as text and each [[...]] as a bold total that shows its dice on hover", async ({
  page,
}) => {
  const { input, entries, error } = sidebar(page);
  await input.fill("<b>hi</b> I swing [[1d20+5]] for [[1d8+3]]");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);
  await expect(input).toHaveValue("");
  await expect(error).toBeEmpty();
  const note = entries.first().locator(".dice-note");
  // The text that looks like HTML shows as the same characters.
  // innerText leaves out the hidden dice of each total.
  const text = await note.innerText();
  const match = /^<b>hi<\/b> I swing (\d+) for (\d+)$/.exec(text);
  expect(match, text).not.toBeNull();
  await expect(note.locator("b")).toHaveCount(0);
  const totals = note.locator(".dice-total strong");
  await expect(totals).toHaveText([match![1], match![2]]);

  // A hover on a total shows its dice and its modifier.
  const detail = note.locator(".dice-detail").first();
  await expect(detail).toBeHidden();
  await totals.first().hover();
  await expect(detail).toBeVisible();
  const line = /^1d20\+5: \((\d+)\) \+ 5 = (\d+)$/.exec(
    (await detail.textContent()) ?? "",
  );
  expect(line, String(await detail.textContent())).not.toBeNull();
  expect(Number(line![2])).toBe(Number(line![1]) + 5);
  expect(line![2]).toBe(match![1]);
  await page.mouse.move(10, 10);
  await expect(detail).toBeHidden();

  // A plain note has its text and no total.
  await input.fill("I open the door");
  await input.press("Enter");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(1).locator(".dice-note")).toHaveText(
    "I open the door",
  );
  await expect(entries.nth(1).locator(".dice-total")).toHaveCount(0);
});

test("a press on a total shows its dice until a second press, with the green and red dice of a roll entry", async ({
  page,
}) => {
  const { input, entries } = sidebar(page);
  // The server gives fixed dice here.
  const roll = (dice: string, die: number) => ({
    roll: rollTerm(parseTerm(dice)!, () => die),
  });
  await page.route(ROLLS, (route) =>
    route.fulfill({
      status: 201,
      json: {
        roll: {
          id: Number.MAX_SAFE_INTEGER,
          kind: "note",
          at: new Date().toISOString(),
          parts: [roll("1d20+5", 20), { text: " then " }, roll("1d8+3", 1)],
        },
      },
    }),
  );
  await input.fill("[[1d20+5]] then [[1d8+3]]");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);
  const fixed = entries.first();
  const totals = fixed.locator(".dice-total");
  const details = fixed.locator(".dice-detail");
  await totals.nth(0).click();
  await page.mouse.move(10, 10);
  await expect(details.nth(0)).toHaveText("1d20+5: (20) + 5 = 25");
  await expect(details.nth(0).locator(".die-max")).toHaveText("20");
  await expect(totals.nth(0)).toHaveAttribute("aria-expanded", "true");
  await totals.nth(0).click();
  await page.mouse.move(10, 10);
  await expect(details.nth(0)).toBeHidden();
  await totals.nth(1).click();
  await expect(details.nth(1)).toHaveText("1d8+3: (1) + 3 = 4");
  await expect(details.nth(1).locator(".die-min")).toHaveText("1");
});

test("after a reload, the saved log shows oldest first and scrolled to the newest, and an entry sent during the load stays at the bottom, once", async ({
  page,
}) => {
  const { input, entries } = sidebar(page);
  await input.fill("/roll 2d6+1");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);
  const line = await entries.first().locator(".dice-line").textContent();
  for (let n = 2; n <= 15; n++) {
    await input.fill(`/roll d20-${n}`);
    await input.press("Enter");
    await expect(entries).toHaveCount(n);
  }

  let load: Route | undefined;
  await page.route(ROLLS, (route) => {
    if (route.request().method() === "GET") load = route;
    else void route.continue();
  });
  await page.reload();
  await ready(page);
  await expect.poll(() => load).toBeDefined();
  await input.fill("/roll 1d4");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);
  await load!.continue();
  await expect(entries).toHaveCount(16);
  const saved = entries.first();
  await expect(saved.locator(".dice-dice")).toHaveText("2d6+1");
  await expect(saved.locator(".dice-line")).toHaveText(line!);
  await expect(entries.nth(14).locator(".dice-dice")).toHaveText("1d20-15");
  await expect(entries.last().locator(".dice-dice")).toHaveText("1d4");
  await expect.poll(() => scrolledToEnd(page)).toBe(true);
});

test("an entry that the load shows first is not added again by the send", async ({
  page,
}) => {
  const { input, entries } = sidebar(page);
  let load: Route | undefined;
  let send: Route | undefined;
  let saved: Awaited<ReturnType<Route["fetch"]>> | undefined;
  await page.route(ROLLS, async (route) => {
    if (route.request().method() === "GET") {
      load = route;
      return;
    }
    // The server saves the entry now. The answer to the browser waits.
    send = route;
    saved = await route.fetch();
  });
  await page.reload();
  await ready(page);
  await expect.poll(() => load).toBeDefined();
  await input.fill("/roll 1d4");
  await input.press("Enter");
  await expect.poll(() => saved).toBeDefined();
  // The load answers first, with the new row.
  await load!.continue();
  await expect(entries).toHaveCount(1);
  await send!.fulfill({ response: saved! });
  await expect(input).toHaveValue("");
  await expect(entries).toHaveCount(1);
});

test("when the saved rolls do not load, the log is empty, a notice shows, and a roll still works", async ({
  page,
}) => {
  const { input, entries } = sidebar(page);
  await input.fill("/roll 1d6");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);

  await page.route(ROLLS, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 503, body: "" })
      : route.continue(),
  );
  await page.reload();
  await ready(page);
  await expect(page.getByRole("status")).toHaveText("Saved rolls did not load");
  await expect(entries).toHaveCount(0);

  await input.fill("/roll 1d8");
  await input.press("Enter");
  await expect(entries).toHaveCount(1);
  await expect(entries.first().locator(".dice-dice")).toHaveText("1d8");

  // When the saved moves do not load too, the notice holds both texts, once each.
  await page.route("**/api/scenes/*/positions", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  await page.reload();
  await ready(page);
  const notice = page.getByRole("status");
  await expect(notice).toContainText("Saved moves did not load");
  await expect(notice).toContainText("Saved rolls did not load");
  await expect
    .poll(async () => (await notice.locator("span").allTextContents()).sort())
    .toEqual(["Saved moves did not load", "Saved rolls did not load"]);
});

test("on a narrow window, the log shows its newest entry when the sidebar opens", async ({
  page,
}) => {
  const { toggle, panel, entries } = sidebar(page);
  // Save enough entries to fill the log.
  for (let n = 1; n <= 20; n++) {
    const res = await page.request.post("/api/scenes/demo/rolls", {
      data: { text: `/roll d20-${n}` },
    });
    expect(res.status()).toBe(201);
  }
  await page.setViewportSize({ width: 600, height: 800 });
  await page.reload();
  await ready(page);
  // The sidebar is closed at the start, so the log cannot scroll yet.
  await expect(panel).toBeHidden();
  // The entries load while the panel is hidden, so the open itself must scroll.
  await expect(entries).toHaveCount(20);
  await toggle.click();
  await expect(panel).toBeVisible();
  expect(await scrolledToEnd(page)).toBe(true);
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
  await input.fill("   /roll 1d6   ");
  await input.press("Enter");
  await expect.poll(() => sends.length).toBe(1);
  // The request has the trimmed text. The input keeps the text as typed.
  expect(sends[0].request().postDataJSON()).toEqual({ text: "/roll 1d6" });
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

  await expect(input).toHaveValue("   /roll 1d6   ");
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

  // On a window from 768px, the notice does not cover the open sidebar.
  await page.setViewportSize({ width: 800, height: 800 });
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const notice = page.locator(".notice");
  await notice.evaluate((el) => {
    el.textContent = "Move not saved. Try again.";
  });
  const noticeBox = await notice.boundingBox();
  const sidebarBox = await page.locator(".dice").boundingBox();
  expect(noticeBox!.x).toBeGreaterThanOrEqual(0);
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(sidebarBox!.x);
});

test("a press on the sidebar does not pan, and Q, E and Esc in the input are text", async ({
  page,
}) => {
  const { input } = sidebar(page);
  const before = await hook(page, "squareScreen", 0, 0);

  // A right-button drag on the sidebar does not pan the board.
  const drag = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...from);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(...to, { steps: 5 });
    await page.mouse.up({ button: "right" });
  };
  await drag([1100, 300], [1000, 360]);
  expect(await hook(page, "squareScreen", 0, 0)).toEqual(before);
  // The same drag on the board pans it.
  await drag([300, 600], [200, 660]);
  expect(await hook(page, "squareScreen", 0, 0)).not.toEqual(before);

  // Q and E in the input are text: the camera does not turn. A turn lasts about
  // 250 ms, so wait longer than that before the check.
  const panned = await hook(page, "squareScreen", 0, 0);
  await input.click();
  await page.keyboard.type("qQ eE");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("qQ eE");
  await page.waitForTimeout(500);
  expect(await hook(page, "squareScreen", 0, 0)).toEqual(panned);
  // Outside the input, Q turns the camera as before. E turns it back.
  await input.blur();
  await page.keyboard.press("q");
  await expect.poll(() => hook(page, "squareScreen", 0, 0)).not.toEqual(panned);
  await page.keyboard.press("e");
  await expect.poll(() => hook(page, "squareScreen", 0, 0)).toEqual(panned);

  // Esc in the input does not cancel a drag.
  const fighter = await hook(page, "spriteScreen", "fighter");
  await page.mouse.move(fighter!.x, fighter!.y);
  await page.mouse.down();
  await page.mouse.move(fighter!.x + 40, fighter!.y, { steps: 5 });
  const dragTarget = () => hook(page, "dragTarget");
  expect(await dragTarget()).not.toBeNull();
  await input.focus();
  await page.keyboard.press("Escape");
  expect(await dragTarget()).not.toBeNull();
  await page.mouse.up();
});
