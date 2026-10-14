import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool, migrate } from "./db.js";
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

// Three squares by three. The scene puts a on [0, 0], b on [1, 0] and c on [2, 2].
const SCENE = {
  version: 1,
  name: "Test",
  board: {
    width: 3,
    depth: 3,
    materials: { s: { name: "stone", top: "#888888", side: "#666666" } },
    heights: ["000", "000", "000"],
    tiles: ["sss", "sss", "sss"],
  },
  sprites: [
    { id: "a", name: "A", image: "a.png", at: [0, 0] },
    { id: "b", name: "B", image: "b.png", at: [1, 0] },
    { id: "c", name: "C", image: "c.png", at: [2, 2] },
  ],
};
const LAYOUT = { a: [0, 0], b: [1, 0], c: [2, 2] };

describe.skipIf(!url)("the positions API on Postgres", () => {
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

  it("answers 409 for a square that another sprite of this visitor holds", async () => {
    const me = visitor();
    // b stands on [1, 0] in the scene file.
    expect((await put(me, "a", { at: [1, 0] })).status).toBe(409);
    // Another visitor's sprites do not block.
    const other = visitor();
    expect((await put(other, "c", { at: [1, 1] })).status).toBe(200);
    expect((await put(me, "a", { at: [1, 1] })).status).toBe(200);
    // A saved move blocks too, and the square it left comes free.
    expect((await put(me, "b", { at: [1, 1] })).status).toBe(409);
    expect((await put(me, "b", { at: [0, 0] })).status).toBe(200);
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
