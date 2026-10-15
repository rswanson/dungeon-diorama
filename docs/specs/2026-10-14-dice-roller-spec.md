# Dice roller — spec

Status: DRAFT
Date: 2026-10-14

## Goals / Non-goals

### Goals

- Add a dice sidebar to the page. It shows a log of dice rolls and has a text input.
- Roll dice with a command: `/roll 1d6`, `/roll 5d20`, `/roll 1d20+5`.
- Roll dice inside free text: `I swing at the goblin [[1d20+5]] for [[1d8+3]]`.
- Log plain text with no roll as a note: `I open the door`.
- Save each entry in Postgres for the visitor (`dd_visitor` cookie) and the scene, so a reload shows the log.
- The server makes the random numbers, so the API cannot save a fake result.

### Non-goals (this spec)

- No shared log and no live updates between tabs or people. Only the visitor sees their log.
- No commands other than `/roll`. No `/r` short form.
- No text after the dice of a `/roll` (no label). Use a note for a roll with text.
- No dice expressions with more than one dice term (`1d8+2d6`), no keep-highest (`4d6kh3`), no advantage.
- No delete, edit or clear of log entries.
- No rate limit.
- No dice animation and no sound.
- The page does not remember if the sidebar was open or closed.

## Users & flows

The user is the same person as in the board spec: a person who runs a tabletop RPG scene in a browser.

1. Open the app. On a window 768px or wider, the dice sidebar is open. On a narrower window, it is closed and only its button shows.
2. The sidebar shows the newest 50 entries of this visitor for this scene, oldest at the top. It scrolls to the newest entry.
3. Type `/roll 2d6+1` and press Enter. A new entry shows at the bottom: `2d6+1`, then `(4, 3) + 1 = 8`, with the total in bold and the local time. The input clears.
4. Type `I swing [[1d20+5]] for [[1d8+3]]` and press Enter. A note shows the text with each `[[...]]` replaced by its total in bold. A hover or a tap on a total shows its dice and modifier.
5. Type `I open the door` and press Enter. A note shows the text.
6. Type `/roll 2d0` and press Enter. An error shows under the input. The input keeps the text. Nothing goes in the log.
7. Close the sidebar with its button. Open it again with the same button.
8. Reload. The log shows the same entries.

## Scope boundaries

- Client: a new sidebar in `index.html` and new modules in `src/client/`. Plain DOM and CSS, as the rest of the client. No UI framework.
- Shared: a new input parser in `src/shared/` that the client and the server both use.
- Server: two new routes in the `/api` app and one new migration at the end of `MIGRATIONS`.
- The board, the camera, the drag, the positions API and the scene file do not change, except as "Keys" and "Layout" below say.
- Tests: Vitest unit tests, API tests on a real Postgres, and one new Playwright test.

## Behavior (interfaces, data, commands)

### Dice notation

A dice term is `NdS`, with an optional modifier `+M` or `-M`.

- `N` is the number of dice: a whole number from 1 to 100. It is optional: `d20` is the same as `1d20`.
- `S` is the number of sides: a whole number from 2 to 100.
- `M` is a whole number from 0 to 1000. With its sign, the modifier is from -1000 to 1000. No modifier is the same as `+0`.
- The `d` can be `d` or `D`. Spaces between the parts are allowed: `2d6 + 1` is the same as `2d6+1`. A space inside a number (`1 0d6`) is an error.
- Each die is a random whole number from 1 to `S`, from `crypto.randomInt` on the server.
- The total is the sum of the dice, plus the modifier. It can be negative (`1d2-1000`).

### Input

The input is one line. The parser reads the text after it removes the spaces at the start and the end.

| Input | Result |
|---|---|
| Empty, or only spaces | Nothing happens. No error, no request. |
| More than 500 characters (JavaScript string length) | Error: `Use at most 500 characters.` |
| Starts with `/roll` (any case), then a space and one dice term, and nothing else | A roll entry. |
| `/roll` with no dice | Error: `Give the dice, for example /roll 1d20+5.` |
| `/roll` with a bad dice term, or text after the dice | Error: `` `<the text after /roll>` is not valid dice. Use NdS±M, for example /roll 1d20+5. `` |
| Starts with `/` and is not `/roll` | Error: `Unknown command. Use /roll 1d20+5 or [[1d20+5]].` |
| Any other text | A note entry. Each `[[...]]` in it is a roll. |
| A note with a bad dice term in a `[[...]]`, an empty `[[]]`, or a `[[` with no `]]` | Error: `` `<the bad part>` is not valid dice. Use NdS±M, for example [[1d20+5]]. `` |
| A note with more than 10 `[[...]]` | Error: `Use at most 10 [[...]] rolls in one message.` |

- A `]]` with no `[[` before it is plain text.
- `/roll` must be followed by a space or the end of the text: `/rolls 1d6` is an unknown command.
- On an error, nothing is saved and nothing goes in the log. The input keeps the text.
- The parser is `parseInput(text)` in `src/shared/dice.ts`. It gives the parts of the entry, or an error message. The client calls it before it sends, so a bad input shows its error at once. The server calls it again and is the authority.

### Entry

The API gives each entry as JSON:

```json
{
  "id": 42,
  "kind": "note",
  "at": "2026-10-14T18:03:00.000Z",
  "parts": [
    { "text": "I swing at the goblin " },
    { "roll": { "dice": "1d20+5", "count": 1, "sides": 20, "modifier": 5, "results": [17], "total": 22 } },
    { "text": " for " },
    { "roll": { "dice": "1d8+3", "count": 1, "sides": 8, "modifier": 3, "results": [6], "total": 9 } }
  ]
}
```

- `kind` is `roll` (from `/roll`) or `note` (any other text).
- A `roll` entry has exactly one part: a `roll` part.
- A `note` entry has its parts in the order of the text. A note with no `[[...]]` has one `text` part.
- `dice` is the normal form of the term: lower-case `d`, the count always written, no spaces, no `+0`. For example `2D6 + 0` gives `2d6`, and `d20` gives `1d20`.
- `at` is the server time of the roll, in ISO 8601 UTC.
- `id` is a whole number. A newer entry of a visitor has a higher `id`.

### Database

A new migration at the end of `MIGRATIONS`:

```sql
CREATE TABLE dice_rolls (
  id         bigserial   PRIMARY KEY,
  visitor_id uuid        NOT NULL,
  scene      text        NOT NULL,
  kind       text        NOT NULL CHECK (kind IN ('roll', 'note')),
  parts      jsonb       NOT NULL,
  rolled_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dice_rolls_visitor_scene ON dice_rolls (visitor_id, scene, id DESC);
```

- The table keeps every entry. Nothing deletes rows.

### API

| Call | Does |
|---|---|
| `GET /api/scenes/:scene/rolls` | `200 {"rolls": [Entry, ...]}`: the newest 50 entries of this visitor for this scene, oldest first. An empty list for a new visitor. |
| `POST /api/scenes/:scene/rolls` with `{"text": "..."}` | Parses the text, rolls, saves, and gives `201 {"roll": Entry}`. |

- Both calls use the `dd_visitor` cookie, as the positions API does. A request with no cookie gets a new visitor.
- `404 {"error": "The scene does not exist."}` when no scene file has the name.
- `400 {"error": "<the parser's message>"}` for a bad input, an empty input, or a body that is not `{"text": "<string>"}`.
- `413 {"error": "The body is too large."}` for a body of more than 4096 bytes.
- `500 {"error": "The server failed."}` when the database fails. Nothing is saved.

### Layout

- The sidebar is a parchment panel on the right of the window, 320px wide (at most the window width), over the board. It has the same parchment style as the notice and the labels.
- From top to bottom: a heading `Dice`, the log (it scrolls), the error line, and the input.
- The input has a placeholder: `/roll 1d20+5 or text with [[1d6]]`.
- A button with the label `Dice` opens and closes the sidebar. It is at the top right of the window when the sidebar is closed, and in the sidebar's heading when it is open. It has `aria-expanded`.
- At the start, the sidebar is open when the window is 768px or wider, and closed when it is narrower. A later window resize does not open or close it.
- When the sidebar is open, the turn buttons move left, so the sidebar does not cover them.
- A press on the sidebar does not start a drag or a camera pan.

### Log entries

- A `roll` entry shows the `dice` on one line, then the dice results in brackets, the modifier, and the total in bold: `(4, 3) + 1 = 8`. With no modifier: `(4, 3) = 7`. A negative modifier shows as `- 2`.
- A `note` entry shows its text parts as plain text and each roll part as its total in bold. A hover or a tap on a total shows the same line as a `roll` entry (`1d20+5: (17) + 5 = 22`).
- In each result list, a die that shows `S` (its highest face) is green, and a die that shows 1 is red. For a d2, a 2 is green and a 1 is red.
- Each entry shows its time as local `HH:MM` in small text.
- The client puts all text in the page as text, never as HTML.
- The log scrolls to the newest entry after it loads and after each new entry.

### Keys

- Q, E and Esc in the input do not turn the camera and do not cancel a drag. The keys work as normal text keys there.
- Enter in the input sends the text.
- Outside the input, Q, E and Esc work as before.

### Send

- During a send, a second Enter does nothing.
- On `201`, the entry goes at the bottom of the log and the input clears.

## Edge cases & failure modes

- A send fails (`5xx`, or no network): nothing goes in the log. The input keeps the text, and the error line shows `Roll not saved. Try again.` Enter sends it again. The server rolls only in the same transaction as the save, so no result is lost.
- A send gives `400`: the error line shows the server's message. The input keeps the text.
- The log cannot load: the log is empty, and a notice says `Saved rolls did not load`. The input still works, and new entries go in the log.
- The scene does not exist, or the scene file has problems: the page shows the error panel as before. The sidebar does not show.
- The log has more than 50 entries: the sidebar shows the newest 50. A new entry goes at the bottom, and the oldest one on the page stays until a reload.
- Two tabs of one visitor: no live sync. Each tab shows its own new entries. A reload shows the entries of both.
- A `[[...]]` and a `/roll` in one input (`/roll 1d6 [[1d4]]`): this is a `/roll` with text after the dice, so it is an error.
- Text in a note that looks like HTML (`<b>`): it shows as the same characters, not as HTML.

## Testing & acceptance

### Unit tests (Vitest)

- `parseInput`: each row of the input table, with its error message.
- The dice term limits: `1d2`, `d20`, `100d100`, `+1000` and `-1000` are valid. `0d6`, `101d6`, `1d1`, `1d101` and `+1001` are errors.
- The normal form of `dice` (case, spaces, `+0`).
- The roll: with a fixed random source, the results and the total are correct, and each die is from 1 to `S`.
- The log entry text: the result line, the modifier sign, and which dice are green and red.

### API tests (Vitest, real Postgres)

- A new visitor gets an empty log.
- A `POST` of `/roll 2d6+1` gives `201` and an entry with 2 results from 1 to 6. A later `GET` gives it.
- A `POST` of a note with two `[[...]]` gives the parts in order.
- Another visitor does not see the entries. Another scene of the same visitor does not show them.
- With 51 entries, the `GET` gives the newest 50, oldest first.
- `400` (bad dice, unknown command, empty text, a body with no `text`), `404` and `413` cases.

### End-to-end test (Playwright, built server, real Postgres)

- Load the demo scene. Type `/roll 2d6+1` in the input and press Enter. An entry for `2d6+1` shows in the log. Reload. The entry still shows.

### Acceptance

- The sidebar opens and closes, and it does not cover the turn buttons.
- `/roll`, notes with `[[...]]`, and plain notes work as the input table says, on a desktop and on an iPad.
- Each error in the input table shows under the input and logs nothing.
- The log stays after a reload, per visitor and per scene.
- Typing Q or E in the input does not turn the camera.
- The board still keeps 60 fps during a drag with the sidebar open.
- Works on the latest desktop Chrome, Firefox and Safari, and iPad Safari.
- The change is live on the Caster address after the deploy.

## Assumption ledger

(No open entries.)

## Decision log

| # | Question | Decision | Resolved by |
|---|----------|----------|-------------|
| D1 | Who sees a roll, and does it stay after a reload? | Per visitor, saved in Postgres. No sharing. | User |
| D2 | Notation | `NdS` with an optional `±M` | User (confirmed default) |
| D3 | Limits | 1–100 dice, d2–d100, modifier -1000 to 1000 | User (confirmed default) |
| D4 | Log scope | Per visitor and scene | User (confirmed default) |
| D5 | History | Show the newest 50, keep all rows | User (confirmed default) |
| D6 | Layout | Right sidebar that can close; open at the start at 768px or wider | User (confirmed default) |
| D7 | Input forms | `/roll <dice>` and `[[dice]]` | User (added `[[...]]`) |
| D8 | Where `[[...]]` can be | Inside free text, up to 10 in one message | User (confirmed default) |
| D9 | Plain text | Logged as a note | User (changed the default) |
| D10 | Text after `/roll` dice | Not allowed: an error | User (changed the default) |
| D11 | Entry look | Each die, modifier and total; highest face green, 1 red | User |
| D12 | Who rolls | The server, with `crypto.randomInt` | User (confirmed default) |
| D13 | Failed save | Keep the text, show `Roll not saved. Try again.`, log nothing | User (confirmed default) |
| D14 | Input length | 500 characters | User (confirmed default) |
| D15 | Unknown command | An error, nothing logged | User (confirmed default) |
| D16 | Bad `[[...]]` in a note | The full input is an error, nothing logged | User (confirmed default) |
| D17 | Highest and lowest face colors | For each die size: `S` green, 1 red | User (confirmed default) |
| D18 | `[[...]]` in a note | Total in bold; hover or tap shows the dice | User (confirmed default) |
| D19 | Log order | Oldest at the top; scroll to the newest | User (confirmed default) |
| D20 | Entry time | Server time, shown as local `HH:MM` | User (confirmed default) |
| D21 | Keys in the input | Q, E, Esc do not act on the board; Enter sends | User (confirmed default) |
| D22 | Sidebar open state | Not remembered; window-width rule at each load | User (confirmed default) |
| D23 | Rate limit | None | User (confirmed default) |
| D24 | Tests | Parser unit tests, API tests, one Playwright test | User (confirmed default) |
| D25 | Is the count required, or is `d20` the same as `1d20`? (ledger 1) | Optional: `d20` is the same as `1d20` | User (changed the default) |
