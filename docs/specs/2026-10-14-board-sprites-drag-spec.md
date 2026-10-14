# Board, sprites and drag-move — spec

Status: APPROVED
Date: 2026-10-14

## Goals / Non-goals

### Goals

- Start **dungeon-diorama**: a web RPG engine with voxel sprites on a 3D board and a D&D 3.5e flavor.
- Show a square-grid board where each square is a voxel column with a height.
- Show characters as "2D(ish) voxel sprites": pixel art extruded into a thin voxel slab that stands upright on its square.
- Let the player move a sprite with click and drag (mouse and touch). The sprite snaps to a square.
- Load the board and the sprites from a JSON scene file and PNG images, so a person can change them without code.
- Save each visitor's sprite moves in Postgres, so a reload shows the board as they left it.
- Put the game online with Caster, in the user's account. Claude deploys `main` through Caster's MCP server after each merge.

### Non-goals (this milestone)

- No in-game editor. A person edits the scene file and merges it to `main`.
- No 3.5e rules: no speed limit, no climb limit, no initiative, no turns, no attacks, no character sheets.
- No sign-in, no shared board, no live updates between tabs or people.
- No reset of a visitor's saved positions.
- No creatures larger than one square.
- No lighting effects beyond one sun light with shadows, and no fog of war.

## Users & flows

The user is a person who builds and runs a tabletop RPG scene in a browser. Each visitor has their own copy of each scene's sprite positions.

1. Open the app. It loads the scene `demo` (or `?scene=<name>`): the board and the sprites from the scene file, with this visitor's saved positions on top.
2. Pan, zoom and rotate the camera to look at the board.
3. Press on a sprite and drag. The sprite lifts and follows the pointer. The square under the pointer shows green (free) or red (occupied or off the board). A path line shows the shortest route from the start square, with its length in feet.
4. Release. On a free square, the sprite moves there and the move saves. Otherwise it goes back to its start square.
5. Press Esc during a drag to cancel. The sprite goes back to its start square.
6. Reload. The sprites are where the visitor left them.

## Scope boundaries

- New public repo `rswanson/dungeon-diorama`. Nothing is shared with `here-there-be-dragons`.
- Client: TypeScript, Three.js, Vite. No UI framework.
- Server: Node 22, TypeScript, Hono. It serves the built client, the scene files and the sprite images, and a JSON API. Postgres through the `pg` package, with plain SQL migrations.
- Tests: Vitest for unit and API tests (API tests against a real Postgres), Playwright for one end-to-end drag test.
- CI on pull requests (GitHub Actions, with a Postgres service): type check, lint, unit and API tests, build, end-to-end test.
- Deploy: Caster project `dungeon-diorama` from the GitHub repo, with a Caster Postgres database, on its default Caster address. Deploy on push is off: after each merge, Claude runs Caster's `setup-project` with `project: dungeon-diorama` from `main`.

## Behavior (interfaces, data, commands)

### Scene file

`public/scenes/<name>.json`. The scene name is the file name without `.json`, and matches `^[a-z0-9-]{1,40}$`.

```json
{
  "version": 1,
  "name": "Goblin Warren",
  "board": {
    "width": 16,
    "depth": 12,
    "materials": {
      "s": { "name": "stone", "top": "#8a8a8a", "side": "#5e5e5e" },
      "g": { "name": "grass", "top": "#5f9e3a", "side": "#6b4a2b" }
    },
    "heights": ["0000111122223333", "..."],
    "tiles":   ["ssssggggssssgggg", "..."]
  },
  "sprites": [
    { "id": "fighter", "name": "Aldric the Fighter", "image": "sprites/fighter.png", "at": [2, 3] }
  ]
}
```

- `heights`: one string per row (`depth` rows of `width` characters). Each character is `0`–`9`: the number of voxel layers above the base layer.
- `tiles`: same shape. Each character is a key in `materials`.
- `at`: `[x, z]` square, `0`-based. `x` goes along a row, `z` goes down the rows.
- A sprite stands on the top face of its square's column.
- The scene file is the start layout. The server and the client use the same validation code.

### Visitor

- On the first request without one, the server sets a cookie `dd_visitor`: a random UUID, `HttpOnly`, `SameSite=Lax`, `Secure` in production, for 400 days.
- The visitor id is not a secret account. Anyone with the cookie sees and changes that visitor's positions.

### Database

```sql
CREATE TABLE sprite_positions (
  visitor_id uuid        NOT NULL,
  scene      text        NOT NULL,
  sprite_id  text        NOT NULL,
  x          smallint    NOT NULL,
  z          smallint    NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, scene, sprite_id)
);
```

- A row exists only for a sprite the visitor moved. Other sprites stand where the scene file puts them.
- The server runs pending migrations when it starts. `DATABASE_URL` names the database.

### API

| Call | Does |
|---|---|
| `GET /api/scenes/:scene/positions` | `200 {"positions": {"<sprite id>": [x, z]}}` for this visitor. `404` for a scene file that does not exist. |
| `PUT /api/scenes/:scene/sprites/:spriteId/position` with `{"at": [x, z]}` | Saves the move. `200 {"at": [x, z]}`. `400` when the square is off the board or the body is wrong. `404` for an unknown scene or sprite. `409` when another sprite of this visitor stands on that square. |
| `GET /healthz` | `200` when the server can reach the database. |

- The server reads the scene file to check each move, and the visitor's current positions (scene file with saved rows on top) to check `409`.
- The check and the write happen in one transaction, so two tabs cannot put two sprites on one square.

### Board

- One square is 5 ft and one board unit wide. One height layer is half a unit high.
- The board renders as one merged mesh of voxel columns, with a top color and a side color from the material. Faces that cannot be seen are not drawn.
- A thin grid line shows on the top face of each square.

### Sprites

- A sprite image is a PNG, 16 px wide and up to 32 px high. Transparent pixels are empty.
- Each opaque pixel becomes a voxel 1/16 of a square wide, 2 voxels deep. The bottom row of pixels stands on the square.
- A sprite turns to face the camera at each 90° camera step.
- The starter set is 16x24 PNGs: fighter, wizard, rogue, cleric, goblin, orc.
- A click (no drag) on a sprite shows its name in a small parchment label until the next click elsewhere.

### Camera

- Orthographic isometric view.
- Pan: right-drag or middle-drag on desktop; two-finger drag on touch.
- Zoom: mouse wheel or trackpad pinch; two-finger pinch on touch. The zoom has a minimum and a maximum.
- Rotate: Q and E keys, or the two on-screen buttons, turn the view 90°. The turn animates.

### Drag-move

- A press on a sprite and a pointer move of more than 4 px starts a drag. A press on empty board does nothing in this milestone.
- During a drag:
  - The sprite lifts half a unit and follows the pointer over the board.
  - A ghost outline stays on the start square.
  - The target square glows green when it is on the board and free, red when it is occupied.
  - When the pointer is off the board, no square glows.
  - A path line shows the shortest route from the start square to the target square. The route goes around occupied squares, and a diagonal step can pass between two occupied squares. Height does not block or cost.
  - The route uses the 3.5e diagonal rule: the first diagonal step is 5 ft, the second is 10 ft, and so on, alternating. A label shows the total in feet.
  - When no route exists to a free target, no line shows and the label says "No path". The drop is still allowed.
- Release on a free square: the sprite moves there at once, with a short drop animation, and the client sends the `PUT`.
- Release on an occupied square or off the board: the sprite goes back to the start square. Nothing is sent.
- Esc cancels the drag. A second pointer (touch) during a drag also cancels it.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Client dev server with the API server behind it |
| `npm run db:up` | Starts a local Postgres in Docker |
| `npm run build` | Builds the client and the server |
| `npm start` | Runs the built server (what Caster runs) |
| `npm run check` | Type check, lint, unit and API tests |
| `npm run e2e` | Playwright drag test against the built server |

## Edge cases & failure modes

- Scene file missing: the page shows an error panel that says the scene does not exist. No board.
- Scene file not valid JSON, or with a wrong shape (row length, unknown material key, sprite off the board, two sprites on one square, duplicate sprite id): the error panel names each problem with its row or sprite id.
- Sprite image does not load or is too large: that sprite shows as a magenta block and the console names the image. The rest of the scene loads.
- A save fails (`409`, `5xx`, or no network): the sprite goes back to its start square and a short notice says the move did not save. A `409` also reloads this visitor's positions.
- Positions cannot load: the board shows the scene file layout and a notice says saved moves did not load. Drags still work and save.
- The scene file changes after a visitor saved positions:
  - A saved row for a sprite id the scene no longer has is ignored.
  - A saved position now off the board, or on a square another sprite holds, is ignored, and that sprite stands at its scene position.
- Two tabs of one visitor: no live sync. Each tab saves its own moves; the transaction stops two sprites on one square.
- Window resize: the view fills the window and keeps its center.
- Database not reachable when the server starts: the server exits with an error, and Caster restarts it.

## Testing & acceptance

### Unit tests (Vitest)

- Scene validation: each error case above gives the expected message.
- Path finding: shortest route around occupied squares, the 3.5e diagonal cost (for example, 3 diagonal steps = 20 ft), and "No path".
- Square picking: a point on a column top maps to the correct square at each of the 4 camera rotations.
- Sprite extrusion: a small test image gives the expected voxel count.
- Position merge: saved rows on top of the scene file, with the ignored cases above.

### API tests (Vitest, real Postgres)

- A new visitor gets a cookie and the scene file positions.
- A `PUT` saves, and a later `GET` returns it. Another visitor does not see it.
- `400`, `404` and `409` cases. Two `PUT`s at once onto one square: one gets `409`.

### End-to-end test (Playwright, built server, real Postgres)

- Load the demo scene. Drag the fighter to a free square. The fighter is on that square. Reload. The fighter is still on that square.
- Drag the fighter onto the goblin's square. The fighter goes back to its start square.

### Acceptance

- The demo scene shows a 16x12 board with height changes, four materials (stone, grass, dirt, water), and the six starter sprites.
- Each sprite can be dragged to any free square with a mouse and on an iPad.
- The path line and the feet label update while the pointer moves.
- Moves stay after a reload, per visitor.
- The game is live on its Caster address, and the deploy after each merge to `main` updates it.
- Works on the latest desktop Chrome, Firefox and Safari, and iPad Safari.
- The frame rate stays at 60 fps on a 2020 MacBook Air during a drag.

## Assumption ledger

| # | Question | Proposed default | Status |
|---|----------|------------------|--------|

(No open entries.)

## Decision log

| # | Question | Decision | Resolved by |
|---|----------|----------|-------------|
| D1 | Where does the game live? | New repo | User |
| D2 | Name | dungeon-diorama | User |
| D3 | Rendering stack | Three.js + TypeScript + Vite | User |
| D4 | Sprite look | Extruded pixel art (voxel slab) | User |
| D5 | Board shape | Square grid, each square a column with a height | User |
| D6 | Camera | Orthographic isometric, pan, zoom, rotate in 90° steps | User |
| D7 | Drop rules | Snap to square, one sprite per square, bad drop returns the sprite | User |
| D8 | Customization | JSON scene file + PNG sprites, no editor | User |
| D9 | Starter art | Claude draws 16x24 party and monster PNGs | User |
| D10 | Drag feedback | Lift, target highlight, path line | User |
| D11 | Path | Shortest route around occupied squares, 3.5e diagonal rule, feet label | User |
| D12 | Hosting | Public repo `rswanson/dungeon-diorama` | User |
| D13 | Input | Mouse and touch (pointer events) | User |
| D14 | Do moves persist? (ledger 1) | Yes, in a real database | User (changed the default) |
| D15 | No route to a free target (ledger 2) | No line, "No path" label, drop allowed | User (confirmed default) |
| D16 | Heights and movement (ledger 3) | Visual only | User (confirmed default) |
| D17 | Demo materials (ledger 4) | Stone, grass, dirt, water; water visual only | User (confirmed default) |
| D18 | Diagonal between occupied squares (ledger 5) | Allowed | User (confirmed default) |
| D19 | Click on a sprite (ledger 6) | Parchment name label | User (confirmed default) |
| D20 | Browsers (ledger 7) | Latest desktop Chrome, Firefox, Safari; iPad Safari | User (confirmed default) |
| D21 | Deploy (ledger 8) | Part of the milestone, with Caster, in the user's account | User (changed the default) |
| D22 | Storage | Node (Hono) server + Caster Postgres; scene file seeds, moves save | User |
| D23 | Who moves sprites | Each visitor has their own positions (cookie visitor id) | User |
| D24 | Reset | No reset in this milestone | User |
| D25 | Deploy trigger | Claude deploys `main` through Caster's MCP after each merge; no deploy on push (changed on 2026-10-14) | User |
