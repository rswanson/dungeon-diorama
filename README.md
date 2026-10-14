# Dungeon Diorama

Dungeon Diorama is a web RPG engine with a D&D 3.5e flavor. It shows a square-grid board of voxel columns in 3D, with characters as pixel-art sprites that stand on the squares. You move a character with click and drag. A JSON scene file and PNG images set the board and the sprites.

The server keeps the moves of each visitor in Postgres. A cookie (`dd_visitor`) names the visitor, so a reload shows the board as that visitor left it.

## Commands

Use Node 22 (`.nvmrc`) and Docker (for the local database).

| Command           | Does                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `npm install`     | Installs the dependencies                                                                   |
| `npm run db:up`   | Starts a local Postgres in Docker on port 54329 (`docker-compose.yml`)                      |
| `npm run db:down` | Stops the local Postgres. The data stays in its volume                                      |
| `npm run dev`     | Starts the client dev server (Vite) with the API server (Hono) behind it                    |
| `npm run build`   | Builds the client to `dist/client` and the server to `dist/server`                          |
| `npm start`       | Runs the built server on `PORT` (default 3000). It serves the client and the API            |
| `npm run check`   | Runs the type check, the linter, the format check and the tests                             |
| `npm run e2e`     | Runs the Playwright test on the built server. Run `npm run build` and `npm run db:up` first |
| `npm run format`  | Formats the files with Prettier                                                             |

## Environment

| Variable            | What                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | The Postgres database of the server. In production, the server exits without it. In dev, the server uses the `npm run db:up` database without it |
| `TEST_DATABASE_URL` | The Postgres database of the API tests. Without it, they do not run                                                                              |
| `PORT`              | The port of the server (default 3000)                                                                                                            |
| `NODE_ENV`          | `production` sets `Secure` on the visitor cookie. The Docker image sets it                                                                       |

`.env.example` gives the values for the `npm run db:up` database. The server and the tests do not read a `.env` file: set the variables in your shell.
