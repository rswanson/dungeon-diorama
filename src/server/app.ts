import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import type pg from "pg";
import { createApi } from "./api.js";
import { message } from "./db.js";
import { SceneFiles } from "./scenes.js";

interface AppOptions {
  /** The database. `/healthz` and the API use it. */
  db: pg.Pool;
  /** The folder of the scene files that the API checks each move with. */
  scenesDir: string;
  /** Sets `Secure` on the visitor cookie. True in production. */
  secureCookie?: boolean;
  /** The folder of the built client. Without it, the app serves only the API. */
  clientDir?: string;
}

const HASHED_ASSET = "public, max-age=31536000, immutable";

export function createApp({
  db,
  scenesDir,
  secureCookie = false,
  clientDir,
}: AppOptions): Hono {
  const app = new Hono();

  app.get("/healthz", async (c) => {
    try {
      await db.query("SELECT 1");
      return c.text("ok");
    } catch (error) {
      console.error(`/healthz cannot reach the database: ${message(error)}`);
      return c.text("The server cannot reach the database.", 503);
    }
  });

  if (clientDir) app.use("*", compress());

  app.route(
    "/api",
    createApi({ db, scenes: new SceneFiles(scenesDir), secureCookie }),
  );

  if (clientDir) {
    // The headers that onFound sets do not reach the response, so set them here.
    app.use("*", async (c, next) => {
      await next();
      if (c.res.status !== 200 || !c.res.headers.has("Last-Modified")) return;
      // Vite puts a content hash in each file name under /assets/, so these files
      // never change. Nothing may exist in public/assets/: it has no hashed names.
      c.res.headers.set(
        "Cache-Control",
        c.req.path.startsWith("/assets/") ? HASHED_ASSET : "no-cache",
      );
    });
    app.use("*", serveStatic({ root: clientDir }));
  }

  return app;
}
