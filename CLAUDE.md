# Working in dungeon-diorama

Dungeon Diorama is a web RPG engine. It shows voxel sprites on a 3D square-grid board. The approved spec is in `docs/specs/`. The batch plan is in `docs/batches/`.

## Stack

- Client: TypeScript, Three.js and Vite. There is no UI framework.
- Server: Node 22, TypeScript and Hono (`@hono/node-server`). In production, the server serves the built client, the files in `public/` and a JSON API.
- Database: Postgres 16 through the `pg` package, with plain SQL migrations. The server reads `DATABASE_URL`.
- Tests: Vitest for unit and API tests. The API tests use a real Postgres (`TEST_DATABASE_URL`). Playwright (Chromium only) for the end-to-end drag test in `e2e/`.
- Lint and format: ESLint (flat config, `typescript-eslint`) and Prettier.
- Host: Caster, project `dungeon-diorama`, in the owner's Caster account. A Caster Postgres database of the project gives the server its `DATABASE_URL`. Deploy on push is off. After each merge to `main`, Claude deploys `main` through Caster's MCP server (below).

## Layout

| Path                       | What it is                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`               | The page. Vite builds it with `src/client/main.ts`                                                                                                                 |
| `src/client/`              | The browser code                                                                                                                                                   |
| `src/server/`              | The Hono server. `app.ts` makes the app, `index.ts` starts it. `api.ts` is the positions API, `visitor.ts` the visitor cookie, `db.ts` the pool and the migrations |
| `src/server/migrations/`   | The SQL migrations, `NNN_name.sql`. The server applies each new one when it starts. The build copies them to `dist/server/migrations`                              |
| `docker-compose.yml`       | The local Postgres for dev and the tests (`npm run db:up`)                                                                                                         |
| `src/shared/`              | Code that the client and the server both use, for example the scene validation                                                                                     |
| `public/`                  | Static files (scene files, sprite images). Vite copies them to `dist/client`                                                                                       |
| `scripts/sprites.ts`       | The starter sprites as rows of palette characters. It writes the PNGs in `public/sprites/`. Commit both. A test fails when their pixels differ                     |
| `dist/client`              | The built client (`vite build`)                                                                                                                                    |
| `dist/server`              | The built server (`tsc -p tsconfig.server.json`)                                                                                                                   |
| `tsconfig.base.json`       | The options that the other three `tsconfig` files share. Each one extends it                                                                                       |
| `tsconfig.json`            | The type check for the client and `src/shared`                                                                                                                     |
| `tsconfig.server.json`     | The type check and the build for the server and `src/shared`                                                                                                       |
| `tsconfig.node.json`       | The type check for the tests, `e2e/`, `vite.config.ts`, `playwright.config.ts` and `scripts/`                                                                      |
| `Dockerfile`               | The production image. It builds, then runs `node dist/server/index.js` with only the runtime packages                                                              |
| `.github/workflows/ci.yml` | CI: `npm run check`, `npm run build`, `npm run e2e` and a smoke test of the Docker image on each pull request and each push to `main`, with a Postgres 16 service  |
| `e2e/`                     | The Playwright test (`playwright.config.ts`). It reads the board through `window.diorama` (`src/client/hook.ts`), which changes nothing                            |

- Put a package that the server uses at runtime in `dependencies`. Put all other packages in `devDependencies`. Vite bundles the client packages (for example `three`), so they are dev packages.
- The server code uses Node ESM. A relative import in `src/server/` or `src/shared/` must end in `.js`.
- The server reads `PORT` (default 3000) and listens on `0.0.0.0`.
- The server reads `DATABASE_URL`. At the start, it tries 10 times to reach the database, 1 second apart, applies the migrations, and exits with code 1 when it cannot. A refused connection fails at once, so the server exits after about 10 seconds. A host that does not answer costs 5 seconds for each try (the connect timeout), so the server can take up to about 60 seconds to exit. In dev, without `DATABASE_URL`, it uses the `npm run db:up` database. `/healthz` answers 503 when the database does not answer.
- The server sets the `dd_visitor` cookie on each `/api` request that has none. `NODE_ENV=production` makes it `Secure`.
- `src/shared/positions.ts` (`mergePositions`) puts the saved rows on top of the scene file. The server and the client both use it, so they see one layout.
- The API tests (`src/server/api.test.ts`) run only when `TEST_DATABASE_URL` is set. CI sets it. Each run makes a schema of its own and drops it.
- When a migration changes the database, add a new file in `src/server/migrations/`. Do not change a migration that is on `main`.

## Commands

| Command                | Does                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`          | Starts Vite on port 5173 and the server on port 3000 (`tsx watch`)                          |
| `npm run build`        | Builds the client and the server to `dist/`                                                 |
| `npm start`            | Runs the built server. The image runs the same file: `node dist/server/index.js`            |
| `npm run check`        | Runs the type check, the lint, the format check and the tests                               |
| `npm run typecheck`    | Runs `tsc` on the three `tsconfig` files that extend the base                               |
| `npm run lint`         | Runs ESLint                                                                                 |
| `npm run format`       | Formats the files with Prettier                                                             |
| `npm run format:check` | Checks the format with Prettier                                                             |
| `npm test`             | Runs the Vitest tests                                                                       |
| `npm run e2e`          | Runs the Playwright test on the built server. Run `npm run build` and `npm run db:up` first |
| `npm run db:up`        | Starts the local Postgres in Docker on port 54329                                           |
| `npm run db:down`      | Stops the local Postgres. The data stays in its volume                                      |
| `npm run sprites`      | Writes the starter sprite PNGs from `scripts/sprites.ts` (with `tsx`)                       |

In dev, Vite sends `/api` and `/healthz` to the server on port 3000.

For the API tests, set `TEST_DATABASE_URL` as `.env.example` gives it, after `npm run db:up`. Nothing reads a `.env` file.

## Workflow

- Do all work in a git worktree under `../dungeon-diorama-worktrees`. Do not edit the main checkout.
- Make one branch and one pull request for each batch in the batch plan in `docs/batches/`.
- Write commit messages as `Area: what changed`. The areas are Client, Server, Board, Deploy, Docs and CI.
- Run `npm run check` and `npm run build` before you push.
- Do not change an approved spec or batch plan in `docs/` without the owner. The `Status` line of each batch is the exception: update it as the batch moves. Prettier does not format `docs/`.
- Claude may merge its own PRs in this repo once CI is green and the review is clean (the owner allowed this on 2026-10-14).
- After each merge to `main`, deploy it: run Caster's `setup-project` tool with `project: dungeon-diorama`, `repo: rswanson/dungeon-diorama` and `git_ref: main`. When it answers `working`, call `wait` with its run id until it finishes. Then check `https://dungeon-diorama-kind-orchard.caster.app/healthz` and the change on the live page.
