# Dice roller — batches

Spec: `docs/specs/2026-10-14-dice-roller-spec.md` (APPROVED)
Date: 2026-10-14

Each batch merges to `main` with CI green. Claude then deploys `main` through Caster's MCP (`setup-project` with `project: dungeon-diorama`). Each batch assumes the batches before it are merged.

## B1: Dice sidebar and `/roll`

- **Status:** merged
- **User-visible outcome:** A `Dice` sidebar on the right of the page has a log and an input. `/roll 2d6+1` adds an entry with each die, the modifier and the total. The server rolls and saves each entry, but a reload shows an empty log until B2.
- **Acceptance criteria:**
  1. `parseInput` in `src/shared/dice.ts` (unit tested) reads `/roll` with one dice term as the spec gives it: `[N]dS[±M]`, any case, spaces between the parts, `N` 1–100 (no `N` is 1), `S` 2–100, `M` up to 1000. It gives the normal form of `dice` (`2D6 + 0` gives `2d6`, `d20` gives `1d20`). The limit cases of the spec's unit tests are valid or errors as the spec gives them.
  2. `parseInput` gives the spec's error messages for: more than 500 characters, `/roll` with no dice, `/roll` with a bad dice term or text after the dice, and an unknown command. Until B3, it gives `Unknown command. Use /roll 1d20+5.` for an unknown command, and `Start with /roll, for example /roll 1d20+5.` for text that does not start with `/`. Empty input gives no error and sends nothing.
  3. A new migration at the end of `MIGRATIONS` creates `dice_rolls` and its index as the spec gives them.
  4. `POST /api/scenes/:scene/rolls` with `{"text": "..."}` parses, rolls with `crypto.randomInt`, saves a row, and answers `201 {"roll": Entry}` in the spec's Entry shape. It answers `400`, `404`, `413` and `500` as the spec's API section gives. The roll and the save are in one request, so a failed save gives `500` and no entry.
  5. API tests (real Postgres): `/roll 2d6+1` gives `201`, a `roll` entry with 2 results from 1 to 6, the correct total, and one saved row for this visitor and scene; the `400` cases (bad dice, unknown command, empty text, no `text` in the body), `404` and `413`.
  6. The sidebar follows the spec's Layout section: 320px parchment panel on the right (at most the window width), heading `Dice`, the log, the error line and the input with its placeholder. The `Dice` button opens and closes it and sets `aria-expanded`. It is open at the start at 768px or wider, closed when narrower. The turn buttons move left when it is open. A press on it does not start a drag or a pan.
  7. A `roll` entry shows the `dice`, then `(4, 3) + 1 = 8` with the total in bold (no modifier: `(4, 3) = 7`; a negative one: `- 2`), and the local `HH:MM`. A die that shows `S` is green and a die that shows 1 is red (unit tested on the function that builds the line).
  8. Enter sends. During a send, a second Enter does nothing. On `201` the entry goes at the bottom of the log, the log scrolls to it, and the input clears. On a parser error, a `400`, a `5xx` or no network, the error line shows the message (`Roll not saved. Try again.` for a `5xx` or no network), the input keeps the text, and nothing goes in the log.
  9. Q, E and Esc in the input do not turn the camera or cancel a drag. Outside the input they work as before.
  10. A new Playwright test loads the demo scene, types `/roll 2d6+1`, presses Enter and finds an entry for `2d6+1` in the log. The drag test still passes.
- **How to observe:** Open the Caster address, type `/roll 2d6+1` in the sidebar, press Enter. Type `/roll 2d0` for the error. Press Q in the input: the board does not turn.
- **Touches:** `src/shared/dice.ts`, `src/server/migrations.ts`, `src/server/api.ts` (or a new `src/server/rolls.ts`), `src/client/dice.ts` (new), `src/client/api.ts`, `src/client/main.ts`, `src/client/controls.ts`, `src/client/pointer.ts`, `src/client/style.css`, `index.html`, `e2e/dice.spec.ts`, tests.

## B2: Saved roll log

- **Status:** merged
- **User-visible outcome:** A reload shows the newest 50 entries of this visitor for this scene. Another visitor, or another scene, has its own log.
- **Acceptance criteria:**
  1. `GET /api/scenes/:scene/rolls` answers `200 {"rolls": [Entry, ...]}`: the newest 50 entries of this visitor for this scene, oldest first, and an empty list for a new visitor. It answers `404` for an unknown scene.
  2. API tests (real Postgres): a `POST` then a `GET` gives the entry; another visitor does not see it; another scene of the same visitor does not show it; with 51 entries the `GET` gives the newest 50, oldest first.
  3. The client loads the log at the start, at the same time as the scene file, and shows it oldest at the top, scrolled to the newest entry.
  4. When the log does not load, the log is empty and a notice says `Saved rolls did not load`. The input still works, and new entries go in the log.
  5. The Playwright dice test also reloads and finds the `2d6+1` entry still in the log.
- **How to observe:** Open the Caster address, roll `/roll 1d20`, reload: the entry is still there. Open it in a private window: the log is empty.
- **Touches:** `src/server/api.ts` (or `src/server/rolls.ts`), `src/client/api.ts`, `src/client/dice.ts`, `src/client/main.ts`, `e2e/dice.spec.ts`, tests.

## B3: Notes and `[[...]]` rolls

- **Status:** merged
- **User-visible outcome:** Text with no command goes in the log as a note. Each `[[...]]` in the text rolls, shows its total in bold, and a hover or a tap on the total shows its dice.
- **Acceptance criteria:**
  1. `parseInput` (unit tested) gives a `note` with its parts in the order of the text for any text that does not start with `/`. Each `[[...]]` is a roll part. A `]]` with no `[[` before it is plain text. A note with no `[[...]]` has one `text` part.
  2. `parseInput` gives the spec's errors for a bad dice term in a `[[...]]`, an empty `[[]]`, a `[[` with no `]]`, and more than 10 `[[...]]`. The unknown-command message becomes the spec's `Unknown command. Use /roll 1d20+5 or [[1d20+5]].`, and the B1 message for text that does not start with `/` goes away.
  3. `/roll 1d6 [[1d4]]` is an error, as for text after the dice.
  4. API tests (real Postgres): a `POST` of a note with two `[[...]]` gives `201` and the parts in order, and a later `GET` gives the same parts; a plain note gives one `text` part.
  5. A `note` entry shows its text parts as plain text and each roll part as its total in bold. A hover or a tap on a total shows `1d20+5: (17) + 5 = 22`, with the same green and red dice as a `roll` entry.
  6. The client puts all note text in the page as text: a note `<b>hi</b>` shows those characters, not bold text (unit tested or covered in the Playwright test).
- **How to observe:** Open the Caster address and type `I swing [[1d20+5]] for [[1d8+3]]`, then `I open the door`. Tap a bold total.
- **Touches:** `src/shared/dice.ts`, `src/client/dice.ts`, `src/client/style.css`, tests.

## B4: Board fits the space left of the open sidebar

Added on 2026-10-14 with the spec amendment D26 and D27.

- **Status:** in-progress
- **User-visible outcome:** When the dice sidebar opens on a window 456px or wider, the board moves and resizes into the space left of the sidebar, so the sidebar covers none of it. When the sidebar closes, the board fills the window again. The zoom and the center stay the same.
- **Acceptance criteria:**
  1. On a window 456px or wider, the canvas covers only the area left of the open sidebar (width = window width − 320px), and the full window when the sidebar is closed. The renderer and the camera use the canvas size, not the window size.
  2. Each open or close of the sidebar redraws the view at the new size and keeps the camera's zoom and target. At the least zoom, the whole board is inside the board area (e2e: each board corner's screen point is inside the canvas box with the sidebar open).
  3. On a window narrower than 456px, the canvas keeps the full window when the sidebar is open.
  4. A press, a drag, a right-drag pan and a wheel zoom act on the square under the pointer with the sidebar open (the existing drag e2e tests run with the sidebar open at the default desktop size, and one drag check also runs with the sidebar closed).
  5. A window resize with the sidebar open keeps the canvas left of the sidebar.
- **How to observe:** Open the Caster address on a desktop window. Close and open the sidebar with the `Dice` button: the board moves and resizes, and no part of it is under the sidebar.
- **Touches:** `src/client/main.ts`, `src/client/dice.ts`, `src/client/style.css`, possibly `src/client/pointer.ts`, `src/client/controls.ts` and `src/client/camera.ts`, `e2e/dice.spec.ts`, `e2e/drag.spec.ts`.
