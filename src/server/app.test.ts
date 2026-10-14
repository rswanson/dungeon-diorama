import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { parseMove } from "./api.js";
import { createApp } from "./app.js";

/** A stand-in for the database: each query succeeds, or each query fails. */
function fakeDb(up: boolean): pg.Pool {
  return {
    query: async () => {
      if (!up) throw new Error("connect ECONNREFUSED");
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

const scenesDir = mkdtempSync(join(tmpdir(), "dd-scenes-"));
afterAll(() => rmSync(scenesDir, { recursive: true, force: true }));

describe("GET /healthz", () => {
  it("answers 200 when the database answers", async () => {
    const res = await createApp({ db: fakeDb(true), scenesDir }).request(
      "/healthz",
    );
    expect(res.status).toBe(200);
  });

  it("answers 503 when the database does not answer", async () => {
    const res = await createApp({ db: fakeDb(false), scenesDir }).request(
      "/healthz",
    );
    expect(res.status).toBe(503);
  });
});

describe("parseMove", () => {
  it("takes {at: [x, z]} with two whole numbers only", () => {
    expect(parseMove({ at: [1, 2] })).toEqual([1, 2]);
    for (const body of [
      null,
      [1, 2],
      {},
      { at: [1] },
      { at: [1, 2, 3] },
      { at: [1.5, 2] },
      { at: ["1", 2] },
    ]) {
      expect(parseMove(body)).toBeNull();
    }
  });
});

describe("static client", () => {
  const clientDir = mkdtempSync(join(tmpdir(), "dd-client-"));
  mkdirSync(join(clientDir, "assets"));
  writeFileSync(join(clientDir, "index.html"), "<!doctype html>");
  writeFileSync(join(clientDir, "assets", "x.js"), "export {};\n".repeat(2000));
  afterAll(() => rmSync(clientDir, { recursive: true, force: true }));

  it("sets cache headers only on found files", async () => {
    const app = createApp({ db: fakeDb(true), scenesDir, clientDir });

    const index = await app.request("/");
    expect(index.status).toBe(200);
    expect(index.headers.get("Cache-Control")).toBe("no-cache");

    const asset = await app.request("/assets/x.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );

    const gzipped = await app.request("/assets/x.js", {
      headers: { "Accept-Encoding": "gzip" },
    });
    expect(gzipped.headers.get("Content-Encoding")).toBe("gzip");
    expect(gzipped.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );

    const missing = await app.request("/assets/missing.js");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control") ?? "").not.toContain(
      "immutable",
    );

    const health = await app.request("/healthz");
    expect(health.headers.get("Cache-Control")).toBeNull();
  });
});
