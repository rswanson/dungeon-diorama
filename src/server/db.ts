import pg from "pg";
import { MIGRATIONS } from "./migrations.js";

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
    idleTimeoutMillis: 60_000,
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
 * Runs `fn` in one transaction on one connection of `pool`. It commits when
 * `fn` returns, and rolls back and throws again when `fn` throws.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Applies each migration in `MIGRATIONS` that `schema_migrations` does not
 * list, in order, all in one transaction. It gives the names it applied. An
 * advisory lock stops two servers that start at the same time from a race.
 * The lock ends with the transaction.
 */
export function migrate(pool: pg.Pool): Promise<string[]> {
  return withTransaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
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
    const applied: string[] = [];
    for (const { name, sql } of MIGRATIONS) {
      if (done.has(name)) continue;
      await client.query(sql).catch((error: unknown) => {
        throw new Error(`The migration ${name} failed: ${message(error)}`, {
          cause: error,
        });
      });
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        name,
      ]);
      applied.push(name);
    }
    return applied;
  });
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
