# Board, sprites and drag-move — batches

Spec: `docs/specs/2026-10-14-board-sprites-drag-spec.md` (APPROVED)
Date: 2026-10-14

Each batch merges to `main` with CI green. From B1 on, Claude then deploys `main` through Caster's MCP (`setup-project` with `project: dungeon-diorama`). Each batch assumes the batches before it are merged.

## B1: Live skeleton on Caster

- **Status:** merged
- **User-visible outcome:** The Caster address for `dungeon-diorama` shows a full-window Three.js canvas with a dark background and a title "Dungeon Diorama".
- **Acceptance criteria:**
  1. `npm run dev` opens the page locally with the canvas and the title, with no console errors.
  2. `npm run build` then `npm start` serves the same page from the Hono server on `PORT` (default 3000).
  3. `GET /healthz` answers `200`.
  4. `npm run check` passes: type check, lint, unit tests (one test of the server's `/healthz`).
  5. GitHub Actions runs `npm run check` and `npm run build` on each pull request, and both pass.
  6. Caster project `dungeon-diorama` is live from `rswanson/dungeon-diorama`, and its address shows the page.
- **How to observe:** Open the Caster address.
- **Touches:** `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/client/main.ts`, `src/server/*`, `.github/workflows/ci.yml`, `README.md`, Caster project setup.

## B2: Demo board from the scene file

- **Status:** merged
- **User-visible outcome:** The page shows the demo board: a 16x12 grid of voxel columns with height changes and four materials, grid lines on the tops, one sun light with shadows, in a fixed isometric view.
- **Acceptance criteria:**
  1. `public/scenes/demo.json` follows the spec's scene format: 16x12, heights 0–9 used with steps and ledges, materials stone, grass, dirt, water.
  2. The board renders as one merged mesh; faces between two columns that cannot be seen are not in the mesh (unit test: a 2x1 board of equal heights has no shared inner faces).
  3. Each column has its material's top and side colors, and a thin grid line on its top face.
  4. `?scene=<name>` loads `public/scenes/<name>.json`; a name that does not match `^[a-z0-9-]{1,40}$` or a missing file shows an error panel saying the scene does not exist.
  5. Scene validation (shared module, unit tested) names each problem: wrong row count, wrong row length, height character not `0`–`9`, unknown material key, sprite off the board, two sprites on one square, duplicate sprite id. The page shows them in the error panel.
  6. The view fills the window and keeps its center on resize.
- **How to observe:** Open the Caster address; open `?scene=nope` for the error panel.
- **Touches:** `public/scenes/demo.json`, `src/shared/scene.ts`, `src/client/board.ts`, `src/client/main.ts`, `src/client/errors.ts`, tests.

## B3: Camera controls

- **Status:** merged
- **User-visible outcome:** The player pans, zooms and rotates the board in 90° steps with mouse, keyboard, on-screen buttons or touch.
- **Acceptance criteria:**
  1. Right-drag and middle-drag pan on desktop; two-finger drag pans on touch.
  2. Mouse wheel and trackpad pinch zoom on desktop; two-finger pinch zooms on touch. Zoom stops at a minimum and a maximum.
  3. Q and E, and two on-screen buttons, turn the view 90° left and right with an animation of about 250 ms.
  4. The browser's own context menu does not open on the canvas.
  5. Square picking (unit tested): a point on a column top maps to the correct square at each of the 4 rotations.
- **How to observe:** Open the Caster address and press Q and E; on an iPad, pinch and two-finger drag.
- **Touches:** `src/client/camera.ts`, `src/client/picking.ts`, `src/client/hud.ts`, `index.html`, tests.

## B4: Voxel sprites

- **Status:** in-progress
- **User-visible outcome:** Six voxel sprites (fighter, wizard, rogue, cleric, goblin, orc) stand on their squares in the demo board, turn to face the camera at each 90° step, and show their name in a parchment label when clicked.
- **Acceptance criteria:**
  1. Six 16x24 PNGs are in `public/sprites/`, and `demo.json` places them on distinct squares.
  2. Each opaque pixel becomes a voxel 1/16 of a square wide and 2 voxels deep; the bottom pixel row stands on the column top (unit test: a 2x2 image with 3 opaque pixels gives 6 voxels).
  3. Sprites cast shadows on the board.
  4. After each 90° rotation, every sprite faces the camera.
  5. A click (press and release with less than 4 px of movement) on a sprite shows its name in a parchment label; a click elsewhere hides it.
  6. An image that does not load, or is wider than 16 px or higher than 32 px, shows a magenta block on its square and logs the image path to the console; the other sprites load.
- **How to observe:** Open the Caster address, rotate with Q/E, click the goblin.
- **Touches:** `public/sprites/*.png`, `public/scenes/demo.json`, `src/client/sprites.ts`, `src/client/label.ts`, tests.

## B5: Drag-move

- **Status:** pending
- **User-visible outcome:** The player drags a sprite to a free square and it snaps there; a drop on an occupied square or off the board puts it back. Moves are not saved yet; a reload shows the scene file layout.
- **Acceptance criteria:**
  1. A press on a sprite and a move of more than 4 px starts a drag (mouse, pen and touch through pointer events).
  2. During a drag the sprite lifts half a unit and follows the pointer over the board, and a ghost outline stays on the start square.
  3. The square under the pointer glows green when free, red when occupied; no square glows when the pointer is off the board.
  4. Release on a free square: the sprite moves there with a short drop animation.
  5. Release on an occupied square or off the board: the sprite goes back to its start square.
  6. Esc, or a second touch pointer, cancels the drag and puts the sprite back.
  7. Playwright test (in CI, against the built server): drag the fighter to a free square and it is on that square; drag the fighter onto the goblin's square and it goes back.
- **How to observe:** Open the Caster address and drag the fighter.
- **Touches:** `src/client/drag.ts`, `src/client/highlight.ts`, `src/client/main.ts`, `e2e/drag.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.

## B6: Path line and distance

- **Status:** pending
- **User-visible outcome:** While dragging, a line shows the shortest route from the start square to the target, around occupied squares, with its length in feet by the 3.5e diagonal rule, or "No path".
- **Acceptance criteria:**
  1. Path finding (shared module, unit tested) returns the shortest route on the grid, around occupied squares; a diagonal step can pass between two occupied squares; height does not block or cost.
  2. Cost uses the 3.5e alternating diagonal rule: 1 diagonal = 5 ft, 2 = 15 ft, 3 = 20 ft (unit tested), straight steps 5 ft each.
  3. The line draws on the column tops along the route, and the label near the pointer shows the total, for example "30 ft".
  4. When no route exists to a free target, no line shows and the label says "No path"; the drop still moves the sprite.
  5. The line and label update as the pointer moves to a new square and disappear when the drag ends.
- **How to observe:** Open the Caster address and drag the wizard diagonally across the board.
- **Touches:** `src/shared/path.ts`, `src/client/pathline.ts`, `src/client/drag.ts`, tests.

## B7: Saved moves per visitor

- **Status:** pending
- **User-visible outcome:** A visitor's moves stay after a reload, and each visitor has their own positions. Caster runs the game with a Postgres database.
- **Acceptance criteria:**
  1. The server sets the `dd_visitor` cookie (random UUID, `HttpOnly`, `SameSite=Lax`, `Secure` in production, 400 days) when a request has none.
  2. Migrations create `sprite_positions` as the spec gives it, and run when the server starts; the server exits when it cannot reach `DATABASE_URL`, and `/healthz` checks the database.
  3. `GET /api/scenes/:scene/positions` and `PUT /api/scenes/:scene/sprites/:spriteId/position` behave as the spec's API table gives, with `400`, `404` and `409`; the occupancy check and the write are in one transaction.
  4. API tests against a real Postgres (CI service; `npm run db:up` locally) cover: a new visitor's cookie, save and read back, another visitor does not see it, `400`/`404`/`409`, and two `PUT`s at once onto one square giving one `409`.
  5. Position merge (unit tested): saved rows on top of the scene file; a row for an unknown sprite, off the board, or on a square another sprite holds is ignored.
  6. The client loads positions at start and sends the `PUT` on each drop on a free square. On a failed save the sprite goes back to its start square with a short notice "Move not saved"; a `409` also reloads positions. When positions do not load, the board shows the scene layout with a notice "Saved moves did not load".
  7. The Playwright test also reloads after the drag and finds the fighter still on the new square.
  8. Caster has a Postgres database for the project, the deployed server reads it through `DATABASE_URL`, and a move on the live address stays after a reload.
  9. The game works on the latest desktop Chrome, Firefox and Safari, and on iPad Safari, and a drag holds 60 fps on a 2020 MacBook Air.
- **How to observe:** Open the Caster address, move the rogue, reload: the rogue is where you left it. Open it in a private window: the rogue is at its scene position.
- **Touches:** `src/server/db.ts`, `src/server/migrations/*.sql`, `src/server/visitor.ts`, `src/server/api.ts`, `src/shared/positions.ts`, `src/client/api.ts`, `src/client/notice.ts`, `src/client/drag.ts`, `docker-compose.yml`, `package.json`, `.github/workflows/ci.yml`, `e2e/drag.spec.ts`, Caster database.
