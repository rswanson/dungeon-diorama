import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

// The build puts the client in dist/client, next to dist/server.
// In dev, Vite serves the client, so this folder has no index.html.
const clientDir = fileURLToPath(new URL("../client", import.meta.url));
const hasClient = existsSync(`${clientDir}/index.html`);

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(
    `PORT must be an integer from 1 to 65535. Got "${process.env.PORT}".`,
  );
  process.exit(1);
}
const app = createApp({ clientDir: hasClient ? clientDir : undefined });

const server = serve(
  { fetch: app.fetch, port, hostname: "0.0.0.0" },
  (info) => {
    console.log(`Server on http://0.0.0.0:${info.port}`);
  },
);

// Close the server on a stop signal, so `docker stop` ends with exit code 0.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
