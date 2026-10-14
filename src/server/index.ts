import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createPool, message, migrate, waitForDatabase } from "./db.js";

/** The database of `npm run db:up` (docker-compose.yml). Only dev uses it. */
const DEV_DATABASE_URL = "postgres://dd:dd@localhost:54329/dd";

const production = process.env.NODE_ENV === "production";

// The build puts the client in dist/client, next to dist/server.
// In dev, Vite serves the client, so this folder has no index.html.
const clientDir = fileURLToPath(new URL("../client", import.meta.url));
const hasClient = existsSync(`${clientDir}/index.html`);
// The API reads the scene files from the client that the server serves, or
// from public/ in dev.
const scenesDir = hasClient
  ? `${clientDir}/scenes`
  : fileURLToPath(new URL("../../public/scenes", import.meta.url));

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(
    `PORT must be an integer from 1 to 65535. Got "${process.env.PORT}".`,
  );
  process.exit(1);
}

const databaseUrl =
  process.env.DATABASE_URL || (production ? undefined : DEV_DATABASE_URL);
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. The server needs a Postgres database.",
  );
  process.exit(1);
}
const db = createPool(databaseUrl);
try {
  await waitForDatabase(db);
  const applied = await migrate(db);
  if (applied.length > 0) console.log(`Migrations: ${applied.join(", ")}`);
} catch (error) {
  // Caster starts the server again after it exits.
  console.error(
    `The server cannot use the database at DATABASE_URL: ${message(error)}`,
  );
  await db.end().catch(() => {});
  process.exit(1);
}

const app = createApp({
  db,
  scenesDir,
  secureCookie: production,
  clientDir: hasClient ? clientDir : undefined,
});

const server = serve(
  { fetch: app.fetch, port, hostname: "0.0.0.0" },
  (info) => {
    console.log(`Server on http://0.0.0.0:${info.port}`);
  },
);

// Close the server on a stop signal, so `docker stop` ends with exit code 0.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void db.end().finally(() => process.exit(0));
    });
  });
}
