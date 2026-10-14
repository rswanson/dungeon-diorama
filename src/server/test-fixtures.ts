// The scene that the positions tests and the API tests share. The server build
// leaves this file out (tsconfig.server.json).

import type { Scene } from "../shared/scene.js";

/** Three squares by three. The scene puts a on [0, 0], b on [1, 0] and c on [2, 2]. */
export const SCENE: Scene = {
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

/** The square of each sprite of `SCENE` in its scene file. */
export const LAYOUT = { a: [0, 0], b: [1, 0], c: [2, 2] };
