import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";

interface AppOptions {
  /** The folder of the built client. Without it, the app serves only the API. */
  clientDir?: string;
}

const HASHED_ASSET = "public, max-age=31536000, immutable";

export function createApp({ clientDir }: AppOptions = {}): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  if (clientDir) {
    app.use("*", compress());
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
