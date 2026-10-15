import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";
import { LAYOUT, SCENE } from "./test-fixtures.js";
import { VISITOR_COOKIE, VISITOR_MAX_AGE } from "./visitor.js";

// These tests need a real Postgres: `npm run db:up`, then set
// TEST_DATABASE_URL (see .env.example). Each run uses a schema of its own and
// drops it at the end. CI sets TEST_DATABASE_URL, so there they always run.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  if (process.env.CI) {
    throw new Error("CI must set TEST_DATABASE_URL for the API tests.");
  }
  console.warn(
    "The API tests do not run: TEST_DATABASE_URL is not set. Run `npm run db:up` and set it (see .env.example).",
  );
}

describe.skipIf(!url)("the API on Postgres", () => {
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const scenesDir = mkdtempSync(join(tmpdir(), "dd-api-"));
  writeFileSync(join(scenesDir, "test.json"), JSON.stringify(SCENE));
  let admin: pg.Pool;
  let db: pg.Pool;
  let app: Hono;

  beforeAll(async () => {
    admin = createPool(url!);
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = createPool(url!, `-c search_path=${schema}`);
    await migrate(db);
    app = createApp({ db, scenesDir });
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
    rmSync(scenesDir, { recursive: true, force: true });
  });

  /** A new visitor: a random cookie that the server has not seen. */
  function visitor(): string {
    return `${VISITOR_COOKIE}=${randomUUID()}`;
  }

  function positions(cookie: string, scene = "test") {
    return app.request(`/api/scenes/${scene}/positions`, {
      headers: { Cookie: cookie },
    });
  }

  function put(cookie: string, sprite: string, body: unknown, scene = "test") {
    return app.request(`/api/scenes/${scene}/sprites/${sprite}/position`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("creates sprite_positions as the spec gives it, and migrates once", async () => {
    const { rows } = await db.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'sprite_positions'
        ORDER BY ordinal_position`,
      [schema],
    );
    expect(rows).toEqual([
      { column_name: "visitor_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "scene", data_type: "text", is_nullable: "NO" },
      { column_name: "sprite_id", data_type: "text", is_nullable: "NO" },
      { column_name: "x", data_type: "smallint", is_nullable: "NO" },
      { column_name: "z", data_type: "smallint", is_nullable: "NO" },
      {
        column_name: "updated_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      },
    ]);
    expect(await migrate(db)).toEqual([]);
  });

  it("creates dice_rolls and its index as the spec gives them", async () => {
    const index = await db.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = $1 AND indexname = 'dice_rolls_visitor_scene'`,
      [schema],
    );
    expect(index.rows[0].indexdef).toContain(
      "USING btree (visitor_id, scene, id DESC)",
    );
    // The CHECK refuses another kind.
    await expect(
      db.query(
        `INSERT INTO dice_rolls (visitor_id, scene, kind, parts)
         VALUES ($1, 'test', 'other', '[]')`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("gives a new visitor a cookie and the scene file positions", async () => {
    const res = await app.request("/api/scenes/test/positions");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ positions: LAYOUT });
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(
      new RegExp(`^${VISITOR_COOKIE}=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-`),
    );
    expect(cookie).toContain(`Max-Age=${VISITOR_MAX_AGE}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("sets Secure on the cookie in production, and keeps a cookie it has", async () => {
    const secure = createApp({ db, scenesDir, secureCookie: true });
    const res = await secure.request("/api/scenes/test/positions");
    expect(res.headers.get("Set-Cookie")).toContain("Secure");

    const known = await positions(visitor());
    expect(known.headers.get("Set-Cookie")).toBeNull();
    // A cookie that is not a UUID gets a new one.
    const bad = await positions(`${VISITOR_COOKIE}=not-a-uuid`);
    expect(bad.headers.get("Set-Cookie")).toContain(`${VISITOR_COOKIE}=`);
  });

  it("saves a move, gives it back, and shows it to no other visitor", async () => {
    const me = visitor();
    const res = await put(me, "a", { at: [1, 1] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ at: [1, 1] });

    expect(await (await positions(me)).json()).toEqual({
      positions: { ...LAYOUT, a: [1, 1] },
    });
    expect(await (await positions(visitor())).json()).toEqual({
      positions: LAYOUT,
    });

    // A second move of the same sprite replaces the first.
    expect((await put(me, "a", { at: [0, 2] })).status).toBe(200);
    // A move to the sprite's own square changes nothing.
    expect((await put(me, "a", { at: [0, 2] })).status).toBe(200);
    expect(await (await positions(me)).json()).toEqual({
      positions: { ...LAYOUT, a: [0, 2] },
    });
  });

  it("answers 400 for a wrong body or a square off the board", async () => {
    const me = visitor();
    for (const body of [
      "not json",
      {},
      { at: [1] },
      { at: [1.5, 1] },
      { at: ["1", 1] },
    ]) {
      expect((await put(me, "a", body)).status, JSON.stringify(body)).toBe(400);
    }
    for (const at of [
      [3, 0],
      [0, 3],
      [-1, 0],
    ]) {
      expect((await put(me, "a", { at })).status, String(at)).toBe(400);
    }
  });

  it("answers 404 for an unknown scene or sprite", async () => {
    const me = visitor();
    expect((await positions(me, "nowhere")).status).toBe(404);
    expect((await positions(me, "Not_A_Name")).status).toBe(404);
    expect((await put(me, "a", { at: [1, 1] }, "nowhere")).status).toBe(404);
    expect((await put(me, "orc", { at: [1, 1] })).status).toBe(404);
  });

  it("answers 409 with the layout for a square that another sprite of this visitor holds", async () => {
    const me = visitor();
    // b stands on [1, 0] in the scene file.
    const refused = await put(me, "a", { at: [1, 0] });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "Another sprite stands on that square.",
      positions: LAYOUT,
    });
    // Another visitor's sprites do not block.
    const other = visitor();
    expect((await put(other, "c", { at: [1, 1] })).status).toBe(200);
    expect((await put(me, "a", { at: [1, 1] })).status).toBe(200);
    // A saved move blocks too, and the 409 gives it. The square it left comes free.
    const blocked = await put(me, "b", { at: [1, 1] });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      positions: { ...LAYOUT, a: [1, 1] },
    });
    expect((await put(me, "b", { at: [0, 0] })).status).toBe(200);
  });

  it("answers 413 for a body of more than 1 KB, and saves nothing", async () => {
    const me = visitor();
    const big = JSON.stringify({ at: [1, 1], pad: "x".repeat(2000) });
    const res = await put(me, "a", big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "The body is too large." });
    expect(await (await positions(me)).json()).toEqual({ positions: LAYOUT });
    // A body of the normal size still saves.
    expect((await put(me, "a", { at: [1, 1] })).status).toBe(200);
  });

  it("deletes a saved row that the merge ignores, so its sprite does not jump later", async () => {
    const me = visitor();
    const id = me.slice(VISITOR_COOKIE.length + 1);
    // A saved row for c on [1, 0], where b stands in the scene file. The merge
    // ignores it, so c stays on its scene square [2, 2].
    await db.query(
      `INSERT INTO sprite_positions (visitor_id, scene, sprite_id, x, z)
       VALUES ($1, 'test', 'c', 1, 0)`,
      [id],
    );
    expect(await (await positions(me)).json()).toEqual({ positions: LAYOUT });

    // A later move of another sprite deletes the ignored row.
    expect((await put(me, "a", { at: [1, 1] })).status).toBe(200);
    const { rows } = await db.query(
      `SELECT sprite_id FROM sprite_positions
        WHERE visitor_id = $1 AND scene = 'test' ORDER BY sprite_id`,
      [id],
    );
    expect(rows).toEqual([{ sprite_id: "a" }]);

    // The square comes free. Without the delete, c would jump onto it.
    expect((await put(me, "b", { at: [0, 2] })).status).toBe(200);
    expect(await (await positions(me)).json()).toEqual({
      positions: { a: [1, 1], b: [0, 2], c: [2, 2] },
    });
  });

  function roll(cookie: string, body: unknown, scene = "test") {
    return app.request(`/api/scenes/${scene}/rolls`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("rolls /roll 2d6+1, saves it for this visitor and scene, and gives the entry", async () => {
    const me = visitor();
    const res = await roll(me, { text: "/roll 2D6 + 1" });
    expect(res.status).toBe(201);
    const { roll: entry } = (await res.json()) as {
      roll: {
        id: number;
        kind: string;
        at: string;
        parts: { roll: { results: number[]; total: number } }[];
      };
    };
    expect(entry).toMatchObject({
      kind: "roll",
      parts: [{ roll: { dice: "2d6+1", count: 2, sides: 6, modifier: 1 } }],
    });
    expect(entry.parts).toHaveLength(1);
    const { results, total } = entry.parts[0].roll;
    expect(results).toHaveLength(2);
    for (const die of results) {
      expect(Number.isInteger(die) && die >= 1 && die <= 6, String(die)).toBe(
        true,
      );
    }
    expect(total).toBe(results[0] + results[1] + 1);
    expect(Number.isInteger(entry.id)).toBe(true);
    expect(new Date(entry.at).toISOString()).toBe(entry.at);

    const { rows } = await db.query(
      `SELECT id, kind, parts, rolled_at FROM dice_rolls
        WHERE visitor_id = $1 AND scene = 'test'`,
      [me.slice(VISITOR_COOKIE.length + 1)],
    );
    expect(rows).toEqual([
      {
        id: String(entry.id),
        kind: "roll",
        parts: entry.parts,
        rolled_at: new Date(entry.at),
      },
    ]);
  });

  it("answers 400 for bad dice, an unknown command, empty text or a body with no text, and saves nothing", async () => {
    const me = visitor();
    const cases: [unknown, string][] = [
      [
        { text: "/roll 2d0" },
        "`2d0` is not valid dice. Use NdS±M, for example /roll 1d20+5.",
      ],
      [{ text: "/dance" }, "Unknown command. Use /roll 1d20+5."],
      [{ text: "  " }, "The text is empty."],
      [{}, 'The body must be {"text": "..."}.'],
      [{ text: 5 }, 'The body must be {"text": "..."}.'],
      ["not json", 'The body must be {"text": "..."}.'],
    ];
    for (const [body, error] of cases) {
      const res = await roll(me, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    const { rows } = await db.query(
      "SELECT 1 FROM dice_rolls WHERE visitor_id = $1",
      [me.slice(VISITOR_COOKIE.length + 1)],
    );
    expect(rows).toEqual([]);
  });

  it("answers 404 for an unknown scene and 413 for a body of more than 4 KB", async () => {
    const me = visitor();
    const missing = await roll(me, { text: "/roll 1d6" }, "nowhere");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "The scene does not exist.",
    });
    const big = await roll(me, { text: "/roll 1d6", pad: "x".repeat(4096) });
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: "The body is too large." });
  });

  it("answers 500 and gives no entry when the save fails", async () => {
    // A schema with no tables: the insert fails.
    const broken = createPool(url!, `-c search_path=${schema}_missing`);
    try {
      const res = await createApp({ db: broken, scenesDir }).request(
        "/api/scenes/test/rolls",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "/roll 1d6" }),
        },
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "The server failed." });
    } finally {
      await broken.end();
    }
  });

  it("gives one 409 for two moves at once onto one square", async () => {
    for (let round = 0; round < 5; round++) {
      const me = visitor();
      const results = await Promise.all([
        put(me, "a", { at: [1, 1] }),
        put(me, "c", { at: [1, 1] }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const { positions: layout } = (await (await positions(me)).json()) as {
        positions: Record<string, [number, number]>;
      };
      const on = Object.values(layout).filter(([x, z]) => x === 1 && z === 1);
      expect(on).toHaveLength(1);
    }
  });
});
