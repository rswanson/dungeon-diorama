// A visitor's saved positions on top of the scene file. The server uses this
// to check a move, and the client uses it to put the sprites on the board, so
// both see one layout.

import type { Scene } from "./scene.js";

/** A square as `[x, z]`, as the scene file and the API give it. */
export type At = [number, number];

/** The square of each sprite, by sprite id. */
export type Layout = Record<string, At>;

/** True when `value` is `[x, z]` with two whole numbers. */
export function isAt(value: unknown): value is At {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => Number.isInteger(n))
  );
}

/** True when `[x, z]` is a square of the board. */
export function onBoard(
  { width, depth }: { width: number; depth: number },
  [x, z]: readonly [number, number],
): boolean {
  return x >= 0 && x < width && z >= 0 && z < depth;
}

/**
 * Reads the `positions` of the API's answer: an object of `[x, z]` by sprite
 * id. It gives null when the shape is wrong.
 */
export function parsePositions(data: unknown): Layout | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const entries = Object.entries(data);
  return entries.every(([, at]) => isAt(at))
    ? Object.fromEntries(entries)
    : null;
}

/**
 * The square of each sprite of the scene: its saved square, or its square in
 * the scene file. It ignores a saved row:
 *
 * - for a sprite id that the scene does not have,
 * - for a square off the board,
 * - for a square that another sprite holds after the merge. A sprite that
 *   stands on its scene square keeps it. When two moved sprites share a
 *   square, the first of them in the scene file keeps it.
 *
 * Each sprite that loses its saved square goes back to its scene square, and
 * the check runs again, so no two sprites ever share a square. The result
 * lists the sprites in the order of the scene file.
 */
export function mergePositions(
  scene: Pick<Scene, "board" | "sprites">,
  saved: Readonly<Record<string, readonly [number, number]>>,
): Layout {
  const squares = new Map<string, At>();
  const moved = new Set<string>();
  for (const { id, at } of scene.sprites) {
    const row = Object.hasOwn(saved, id) ? saved[id] : undefined;
    if (row && isAt(row) && onBoard(scene.board, row)) {
      squares.set(id, [row[0], row[1]]);
      moved.add(id);
    } else {
      squares.set(id, [at[0], at[1]]);
    }
  }

  // Each pass sends one or more moved sprites back, so it ends.
  for (;;) {
    const byKey = new Map<string, string[]>();
    for (const [id, [x, z]] of squares) {
      const key = `${x},${z}`;
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
    const back: string[] = [];
    for (const ids of byKey.values()) {
      if (ids.length < 2) continue;
      // Scene squares are unique, so at most one sprite here is not moved.
      const keeper = ids.find((id) => !moved.has(id)) ?? ids[0];
      back.push(...ids.filter((id) => id !== keeper));
    }
    if (back.length === 0) break;
    for (const id of back) {
      const spec = scene.sprites.find((s) => s.id === id);
      if (!spec) continue;
      squares.set(id, [spec.at[0], spec.at[1]]);
      moved.delete(id);
    }
  }
  return Object.fromEntries(squares);
}
