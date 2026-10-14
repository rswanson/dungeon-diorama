import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("GET /healthz", () => {
  it("answers 200", async () => {
    const res = await createApp().request("/healthz");
    expect(res.status).toBe(200);
  });
});

describe("static client", () => {
  const clientDir = mkdtempSync(join(tmpdir(), "dd-client-"));
  mkdirSync(join(clientDir, "assets"));
  writeFileSync(join(clientDir, "index.html"), "<!doctype html>");
  writeFileSync(join(clientDir, "assets", "x.js"), "export {};\n".repeat(2000));
  afterAll(() => rmSync(clientDir, { recursive: true, force: true }));

  it("sets cache headers only on found files", async () => {
    const app = createApp({ clientDir });

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
