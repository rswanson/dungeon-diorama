import { defineConfig } from "vitest/config";

// `npm run dev` runs the Hono server (tsx watch) on PORT, or on 3000.
const API_SERVER = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  build: {
    outDir: "dist/client",
    // three.js is one large chunk on purpose.
    chunkSizeWarningLimit: 600,
  },
  server: {
    proxy: {
      "/api": API_SERVER,
      "/healthz": API_SERVER,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
