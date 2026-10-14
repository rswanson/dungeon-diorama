# Dungeon Diorama

Dungeon Diorama is a web RPG engine with a D&D 3.5e flavor. It shows a square-grid board of voxel columns in 3D, with characters as pixel-art sprites that stand on the squares. You move a character with click and drag. A JSON scene file and PNG images set the board and the sprites.

## Commands

Use Node 22 (`.nvmrc`).

| Command          | Does                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `npm install`    | Installs the dependencies                                                        |
| `npm run dev`    | Starts the client dev server (Vite) with the API server (Hono) behind it         |
| `npm run build`  | Builds the client to `dist/client` and the server to `dist/server`               |
| `npm start`      | Runs the built server on `PORT` (default 3000). It serves the client and the API |
| `npm run check`  | Runs the type check, the linter, the format check and the tests                  |
| `npm run format` | Formats the files with Prettier                                                  |
