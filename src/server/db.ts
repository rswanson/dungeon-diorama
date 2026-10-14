import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * The migrations: `NNN_name.sql` files next to this file. The build copies
 * them to `dist/server/migrations`, so the same path works in dev and in the
 * build.
 */
export const MIGRATIONS_DIR = fileURLToPath(
  new URL("./migrations", import.meta.url),
);
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
/** The advisory lock key of the migrations: one server migrates at a time. */
const MIGRATION_LOCK = 7_331_001;

/**
 * A pool of connections to `url`. `pg` reads the `sslmode` and the other
 * options in the URL. `options` goes to each connection, for example a
 * `search_path` for a test schema.
 */
export function createPool(url: string, options?: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: url,
    options,
    connectionTimeoutMillis: 5_000,
  });
  // An idle connection that the database closes must not stop the server.
  pool.on("error", (error) => {
    console.error(`An idle database connection failed: ${error.message}`);
  });
  return pool;
}

/**
 * Waits until the database answers. It tries `tries` times, `delayMs` apart,
 * so a database that still starts is not an error. It throws the last error.
 */
export async function waitForDatabase(
  pool: pg.Pool,
  { tries = 10, delayMs = 1_000 } = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Applies each migration in `dir` that `schema_migrations` does not list, in
 * the order of the file names, each in its own transaction. An advisory lock
 * stops two servers that start at the same time from a race.
 */
export async function migrate(
  pool: pg.Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name       text        PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const done = new Set(rows.map((row) => row.name));
    for (const name of files) {
      if (done.has(name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, name), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          name,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`The migration ${name} failed: ${message(error)}`, {
          cause: error,
        });
      }
      applied.push(name);
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK])
      .catch(() => {});
    client.release();
  }
  return applied;
}

/**
 * The message of an error, or the value as text. A failed connect to a host
 * with two addresses (for example `localhost`) is an AggregateError with an
 * empty message, so it gives the message of each error in it.
 */
export function message(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(message).join("; ");
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return error.message || (typeof code === "string" ? code : error.name);
  }
  return String(error);
}
