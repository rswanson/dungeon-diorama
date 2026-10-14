# Board, sprites and drag-move — spec

Status: DRAFT
Date: 2026-10-14

## Goals / Non-goals

### Goals

- Start **dungeon-diorama**: a web RPG engine with voxel sprites on a 3D board and a D&D 3.5e flavor.
- Show a square-grid board where each square is a voxel column with a height.
- Show characters as "2D(ish) voxel sprites": pixel art extruded into a thin voxel slab that stands upright on its square.
- Let the player move a sprite with click and drag (mouse and touch). The sprite snaps to a square.
- Load the board and the sprites from a JSON scene file and PNG images, so a person can change them without code.

### Non-goals (this milestone)

- No in-game editor. A person edits the scene file and reloads.
- No 3.5e rules: no speed limit, no climb limit, no initiative, no turns, no attacks, no character sheets.
- No server, no network play, no saved state.
- No creatures larger than one square.
- No lighting effects beyond one sun light with shadows, and no fog of war.
- No deploy. The game runs locally with `npm run dev`.

## Users & flows

The user is a person who builds and runs a tabletop RPG scene in a browser.

1. Open the app. It loads `public/scenes/demo.json`, builds the board and places the sprites.
2. Pan, zoom and rotate the camera to look at the board.
3. Press on a sprite and drag. The sprite lifts and follows the pointer. The square under the pointer shows green (free) or red (occupied or off the board). A path line shows the shortest route from the start square, with its length in feet.
4. Release. On a free square, the sprite moves there. Otherwise it goes back to its start square.
5. Press Esc during a drag to cancel. The sprite goes back to its start square.

## Scope boundaries

- New public repo `rswanson/dungeon-diorama`. Nothing is shared with `here-there-be-dragons`.
- Stack: TypeScript, Three.js, Vite. No UI framework. Vitest for unit tests, Playwright for one end-to-end drag test.
- CI on pull requests: type check, lint, unit tests, build, end-to-end test.

## Behavior (interfaces, data, commands)

### Scene file

`public/scenes/<name>.json`. The app loads `demo.json`, or the scene named in `?scene=<name>`.

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

### Board

- One square is 5 ft and one board unit wide. One height layer is half a unit high.
- The board renders as one merged mesh of voxel columns, with a top color and a side color from the material. Faces that cannot be seen are not drawn.
- A thin grid line shows on the top face of each square.

### Sprites

- A sprite image is a PNG, 16 px wide and up to 32 px high. Transparent pixels are empty.
- Each opaque pixel becomes a voxel 1/16 of a square wide, 2 voxels deep. The bottom row of pixels stands on the square.
- A sprite turns to face the camera at each 90° camera step.
- The starter set is 16x24 PNGs: fighter, wizard, rogue, cleric, goblin, orc.

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
  - A path line shows the shortest route from the start square to the target square. The route goes around occupied squares. Height does not block or cost.
  - The route uses the 3.5e diagonal rule: the first diagonal step is 5 ft, the second is 10 ft, and so on, alternating. A label shows the total in feet.
- Release on a free square: the sprite moves there, with a short drop animation.
- Release on an occupied square or off the board: the sprite goes back to the start square.
- Esc cancels the drag. A second pointer (touch) during a drag also cancels it.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run check` | Type check, lint, unit tests |
| `npm run e2e` | Playwright drag test |

## Edge cases & failure modes

- Scene file missing or not valid JSON: the page shows an error panel that names the file and the problem. No board.
- Scene file with a wrong shape (row length, unknown material key, sprite off the board, two sprites on one square, duplicate sprite id): the error panel names each problem with its row or sprite id.
- Sprite image does not load or is too large: that sprite shows as a magenta block and the console names the image. The rest of the scene loads.
- Window resize: the view fills the window and keeps its center.
- No route to the target (target closed in by occupied squares): see ledger #2.

## Testing & acceptance

### Unit tests (Vitest)

- Scene validation: each error case above gives the expected message.
- Path finding: shortest route around occupied squares, and the 3.5e diagonal cost (for example, 3 diagonal steps = 20 ft).
- Square picking: a point on a column top maps to the correct square at each of the 4 camera rotations.
- Sprite extrusion: a small test image gives the expected voxel count.

### End-to-end test (Playwright)

- Load the demo scene. Drag the fighter to a free square. The fighter is on that square.
- Drag the fighter onto the goblin's square. The fighter goes back to its start square.

### Acceptance

- The demo scene shows a 16x12 board with height changes and four materials, and the six starter sprites.
- Each sprite can be dragged to any free square with a mouse and on an iPad.
- The path line and the feet label update while the pointer moves.
- The frame rate stays at 60 fps on a 2020 MacBook Air during a drag.

## Assumption ledger

| # | Question | Proposed default | Status |
|---|----------|------------------|--------|
| 1 | Do moves persist across a reload? | No. A reload resets to the scene file. | OPEN |
| 2 | What shows when no route exists to a free target square? | No path line; the label says "No path". The drop is still allowed. | OPEN |
| 3 | Do height changes block or cost movement on the path? | No. Heights are visual only in this milestone. | OPEN |
| 4 | Which materials does the demo scene use? | Stone, grass, dirt, water. Water is visual only; sprites can stand on it. | OPEN |
| 5 | Can a diagonal step pass between two occupied squares? | Yes. Only the occupied square itself is blocked. | OPEN |
| 6 | What does a click (no drag) on a sprite do? | Shows the sprite's name in a small parchment label until the next click elsewhere. | OPEN |
| 7 | Which browsers must work? | Latest desktop Chrome, Firefox and Safari, and iPad Safari. | OPEN |
| 8 | Is a deploy part of this milestone? | No. Local only. | OPEN |

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
